import { Noise } from '@chainsafe/libp2p-noise';
import { Bootstrap } from '@libp2p/bootstrap';
import { Stream } from '@libp2p/interface-connection';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import type { Address } from '@libp2p/interface-peer-store';
import { KEEP_ALIVE } from '@libp2p/interface-peer-store/tags';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import * as libp2pLogger from '@libp2p/logger';
import { Mplex } from '@libp2p/mplex';
import { isLoopback } from '@libp2p/utils/multiaddr/is-loopback';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private';
import { WebSockets } from '@libp2p/websockets';
import { all as WSAllfilter } from '@libp2p/websockets/filters';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import { Buffer } from 'buffer/';
import { pipe } from 'it-pipe';
import { createLibp2p, Libp2p } from 'libp2p';
import localforage from 'localforage';
import { levels, LogLevelDesc, LogLevelNumbers } from 'loglevel';
import Multiaddr from 'multiaddr';

import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import { nativeFetch } from '../p2p-fetch/override-fetch';
import status from '../status';

const log = logger.getLogger('worker/p2p-client');

log.setDefaultLevel(levels.ERROR);

// pass logger levels down to libp2p logger
enum LogLevel {
    SILENT = 5,
    ERROR = 4,
    WARN = 3,
    INFO = 2,
    DEBUG = 1,
    TRACE = 0,
}

const levelHandlers: Record<LogLevelNumbers, (extra?: string) => void> = {
    [LogLevel.SILENT]: () => libp2pLogger.disable(),
    [LogLevel.ERROR]: extra =>
        libp2pLogger.enable(
            'libp2p:circuit:error, libp2p:bootstrap:error, libp2p:upgrader:error, ' +
                extra
        ),
    [LogLevel.WARN]: extra =>
        levelHandlers[LogLevel.ERROR]('libp2p:websockets:error, ' + extra),
    [LogLevel.INFO]: extra =>
        levelHandlers[LogLevel.WARN](
            'libp2p:dialer:error, libp2p:connection-manager:trace, ' + extra
        ),
    [LogLevel.DEBUG]: extra =>
        levelHandlers[LogLevel.INFO](
            'libp2p:peer-store:trace, libp2p:mplex:stream:trace, libp2p:*:error, ' +
                extra
        ),
    [LogLevel.TRACE]: extra =>
        levelHandlers[LogLevel.DEBUG]('libp2p:*:trace, ' + extra),
};

const syncLogLevel = () => levelHandlers[log.getLevel()]();

// customize setLevel functionality
const originalLogSetLevel = log.setLevel;
log.setLevel = (level: LogLevelDesc) => {
    originalLogSetLevel.call(log, level);
    syncLogLevel();
};

syncLogLevel();

type GlobalSelf = {
    DIAL_TIMEOUT: number;
    serverPeer: PeerId;
    node: Libp2p;
    libp2p: Libp2p;
    Buffer: typeof Buffer;
    Multiaddr: typeof Multiaddr;
    localforage: typeof localforage;
    streamFactory: AsyncGenerator<StreamMaker, void, string | undefined>;
    latencyMap: Map<string, number>;
    latencySet: Set<string>;
};

const globalSelf = {} as GlobalSelf;

globalSelf.latencyMap = new Map();
globalSelf.latencySet = new Set();

// slightly modified version of
// https://github.com/libp2p/js-libp2p-utils/blob/66e604cb0bfcf686eb68e44f278d62e3464c827c/src/address-sort.ts
// the goal here is to couple prioritizing relays with parallelism
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
globalSelf.addrSort = publicRelayAddressesFirst;
function publicRelayAddressesFirst(a: Address, b: Address): -1 | 0 | 1 {
    // console.log('spam sort', a.multiaddr.toString(), b.multiaddr.toString());
    const haveLatencyA = globalSelf.latencyMap.has(a.multiaddr.toString());
    const haveLatencyB = globalSelf.latencyMap.has(b.multiaddr.toString());

    // if we only have one latency, it's the one we want
    if (haveLatencyA && !haveLatencyB) {
        return -1;
    }
    if (!haveLatencyA && haveLatencyB) {
        return 1;
    }

    if (haveLatencyA && haveLatencyB) {
        // if we have latency info for both, prefer non relay
        const isARelay = isRelay(a);
        const isBRelay = isRelay(b);
        if (isARelay && !isBRelay) {
            return 1;
        }
        if (!isARelay && isBRelay) {
            return -1;
        }
        // if both/neither are relays, prefer the one with lower latency
        const latencyA =
            globalSelf.latencyMap.get(a.multiaddr.toString()) || Infinity;
        const latencyB =
            globalSelf.latencyMap.get(b.multiaddr.toString()) || Infinity;
        if (latencyA < latencyB) {
            return -1;
        }
        if (latencyA > latencyB) {
            return 1;
        }

        // if both have the same latency, return 0
        return 0;
    }

    // we should never get here, but not sure on where this vs filter
    // is called, so leaving old logic just in case;

    const isADNS = isDNS(a);
    const isBDNS = isDNS(b);
    const isAPrivate = isPrivate(a.multiaddr);
    const isBPrivate = isPrivate(b.multiaddr);

    if (isADNS && !isBDNS) {
        return 1;
    } else if (!isADNS && isBDNS) {
        return -1;
    } else if (isAPrivate && !isBPrivate) {
        return 1;
    } else if (!isAPrivate && isBPrivate) {
        return -1;
    } else if (!(isAPrivate || isBPrivate)) {
        const isARelay = isRelay(a);
        const isBRelay = isRelay(b);

        if (isARelay && !isBRelay) {
            return -1;
        } else if (!isARelay && isBRelay) {
            return 1;
        } else {
            return 0;
        }
    } else if (isAPrivate && isBPrivate) {
        const isALoopback = isLoopback(a.multiaddr);
        const isBLoopback = isLoopback(b.multiaddr);

        if (isALoopback && !isBLoopback) {
            return 1;
        } else if (!isALoopback && isBLoopback) {
            return -1;
        } else {
            return 0;
        }
    }

    return 0;
}

function isRelay(ma: Address): boolean {
    const parts = new Set(ma.multiaddr.toString().split('/'));
    return parts.has('p2p-circuit');
}
function isDNS(ma: Address): boolean {
    const parts = new Set(ma.multiaddr.toString().split('/'));
    return parts.has('dns4');
}
globalSelf.localforage = localforage;

async function getWSOpenLatency(ma: string): Promise<number> {
    return new Promise(resolve => {
        setTimeout(resolve, 5000, Infinity);
        try {
            const [_nil, _type, host, _tcp, port, _ws, _p2p, id] =
                ma.split('/');
            const start = Date.now();
            const ws = new WebSocket(`ws://${host}:${port}/p2p/${id}`);
            ws.onopen = () => {
                ws.close();
                resolve(Date.now() - start);
            };
            ws.onerror = () => resolve(Infinity);
        } catch (e) {
            console.error(e);
            resolve(Infinity);
        }
    });
}

async function checkAddress(address: string): Promise<boolean> {
    const latency = await getWSOpenLatency(address);
    // console.log('spam latency', address, latency);
    if (latency < Infinity) {
        globalSelf.latencyMap.set(address, latency);
        globalSelf.latencySet.add(address.split('/p2p-circuit')[0]);
        return true;
    }

    return false;
}

async function initCheckAddresses(addresses: string[]): Promise<string[]> {
    globalSelf.latencyMap = new Map();
    globalSelf.latencySet = new Set();
    await Promise.all(addresses.map(checkAddress));
    return addresses.filter(a => globalSelf.latencyMap.has(a));
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
self.setImmediate = (fn: () => void) => self.setTimeout(fn, 0);

// To disable all workbox logging during development, you can set self.__WB_DISABLE_DEV_LOGS to true
// https://developers.google.com/web/tools/workbox/guides/configure-workbox#disable_logging
//
// self.__WB_DISABLE_DEV_LOGS = true

globalSelf.DIAL_TIMEOUT = 3000;

globalSelf.Multiaddr = Multiaddr;

globalSelf.Buffer = Buffer;

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

type StreamMaker = (protocol: string, id: string) => Promise<Stream>;

async function* streamFactoryGenerator(): AsyncGenerator<
    StreamMaker,
    void,
    string | undefined
> {
    let locked = false;
    let dialTimeout = globalSelf.DIAL_TIMEOUT;
    let retryTimeout = 0;

    const makeStream: StreamMaker = async function (protocol, _piperId) {
        // console.log('get protocol stream', protocol)
        let streamOrNull = null;
        while (!streamOrNull) {
            while (locked) {
                console.log('waiting for reset lock');
                await waitFor(100);
            }
            // attempt to dial our peer, track the time it takes
            const start = Date.now();
            streamOrNull = await Promise.race([
                globalSelf.node
                    .dialProtocol(globalSelf.serverPeer, protocol)
                    .catch(_ => {
                        // console.log('dialProtocol error, retry', Date.now() - start);
                        // console.log('dialProtocol error, retry', _);
                        return null;
                    }),
                waitFor(dialTimeout),
            ]);

            // if we successfully, dialed, we have a stream
            if (streamOrNull) {
                // reset our timeouts
                // use the time of the dial to calculate an
                // appropriate dial timeout
                dialTimeout = Math.max(
                    globalSelf.DIAL_TIMEOUT,
                    Math.floor((Date.now() - start) * 4)
                );
                retryTimeout = 0;
                // if we were NOT previously connected
                if (status.serverPeer !== ServerPeerStatus.CONNECTED) {
                    // we are now
                    status.serverPeer = ServerPeerStatus.CONNECTED;
                }
                // we have a stream, we can quit now
                // console.log('got stream', protocol, streamOrNull)
                break;
            } else if (!locked) {
                locked = true;

                // this is a connection error, if we were previously connected
                if (status.serverPeer === ServerPeerStatus.CONNECTED) {
                    // we aren't anymore
                    status.serverPeer = ServerPeerStatus.CONNECTING;
                }

                // if our retry timeout reaches 5 seconds, then we'll have
                // been retrying for 15 seconds (triangle number of 5).
                // By this point, we're probably offline.
                if (
                    status.serverPeer !== ServerPeerStatus.OFFLINE &&
                    retryTimeout >= 5000
                ) {
                    status.serverPeer = ServerPeerStatus.OFFLINE;
                }

                // wait before retrying
                console.log('Dial timeout, waiting to reset...', {
                    dialTimeout,
                    retryTimeout,
                });

                await waitFor(retryTimeout);

                // if our retry timeout reaches 30 seconds, then we'll have
                // been retrying for 5 minutes 45 seconds
                // (triangle number of 30)
                // time to reset
                if (retryTimeout >= 30000) {
                    retryTimeout = 0;
                }
                // increase our retry timeout
                retryTimeout += 1000;
                // increase our dial timeout, but never make it higher than
                // 5 minutes
                dialTimeout = Math.min(1000 * 60 * 5, dialTimeout * 4);

                // now that we've waiting, we can retry
                // locked = true;
                console.log('Resetting libp2p...');
                const _s = Date.now();
                let bootstraplist = await getBootstrapList(true);
                if (retryTimeout >= 2000) {
                    bootstraplist = await initCheckAddresses(bootstraplist);
                }

                await globalSelf.node.stop();
                await globalSelf.node.start();
                const relays = bootstraplist.map(
                    s => Multiaddr.multiaddr(s) as unknown as MultiaddrType
                );
                await globalSelf.node.peerStore.addressBook
                    .add(globalSelf.serverPeer, relays)
                    .catch(_ => _);
                console.log('reset time', Date.now() - _s);
                locked = false;
            }
        }
        return streamOrNull;
    };

    while (true) {
        // locked = true;
        yield makeStream;
    }
}

export async function getStream(
    protocol = '/samizdapp-proxy',
    id: string = crypto.randomUUID()
) {
    const { value } = await globalSelf.streamFactory.next();

    const makeStream = value as StreamMaker;
    return makeStream(protocol, id);
}

async function openRelayStream(cb: () => unknown) {
    const stream = await getStream('/samizdapp-relay');
    let gotFirstRelay = false;
    // console.log('got relay stream');
    await pipe(stream.source, async function (source) {
        for await (const msg of source) {
            const str_relay = Buffer.from(msg.subarray()).toString();
            if (await checkAddress(str_relay)) {
                if (!gotFirstRelay) {
                    gotFirstRelay = true;
                    cb();
                    await localforage.setItem('libp2p.relays', []);
                }
                await localforage
                    .getItem<string[]>('libp2p.relays')
                    .then(str_array => {
                        const dedup = Array.from(
                            new Set([str_relay, ...(str_array || [])])
                        );

                        return localforage.setItem('libp2p.relays', dedup);
                    });
                const multiaddr = Multiaddr.multiaddr(
                    str_relay
                ) as unknown as MultiaddrType;

                await globalSelf.node.peerStore.addressBook
                    .add(globalSelf.serverPeer, [multiaddr])
                    .catch(_ => _);

                // update status
                if (!status.relays.includes(str_relay)) {
                    status.relays.push(str_relay);
                }
            }
        }
    }).catch(e => {
        console.log('error in pipe', e);
    });
    // we wan't fetch streams to have priority, so let's ease up this loop
    await new Promise(r => setTimeout(r, 20000));
}

function getHostAddrs(hostname: string, tail: string[]): string[] {
    const res = [`/dns4/${hostname}/${tail.join('/')}`];
    if (hostname.endsWith('localhost')) {
        res.push(
            `/dns4/${hostname.substring(0, hostname.length - 4)}/${tail.join(
                '/'
            )}`
        );
    }
    console.log('getHostAddrs', res);
    return res;
}

async function getBootstrapList(skipFetch = false) {
    let newBootstrapAddress = null;
    try {
        if (!skipFetch) {
            newBootstrapAddress = await nativeFetch(
                '/smz/pwa/assets/libp2p.bootstrap'
            )
                .then(res => {
                    if (res.status >= 400) {
                        throw res;
                    }
                    return res.text();
                })
                .then(text => text.trim());
        }
    } catch (e) {
        console.debug('Error while trying to fetch new bootstrap address: ', e);
    }
    const cachedBootstrapAddress =
        (await localforage.getItem<string>('libp2p.bootstrap')) ?? null;
    const bootstrapaddr = newBootstrapAddress || cachedBootstrapAddress;
    if (bootstrapaddr !== cachedBootstrapAddress) {
        console.debug(
            'Detected updated bootstrap address, updating cache: ',
            bootstrapaddr
        );
        await localforage.setItem('libp2p.bootstrap', bootstrapaddr);
    }

    console.debug('got bootstrap addr', bootstrapaddr);
    const relay_addrs =
        (await localforage.getItem<string[]>('libp2p.relays').catch(_ => [])) ??
        [];
    console.debug('got relay addrs', relay_addrs);

    const { hostname } = new URL(self.origin);
    const [_, _proto, _ip, ...rest] = bootstrapaddr?.split('/') ?? [];
    const hostaddrs = getHostAddrs(hostname, rest);
    const res = [bootstrapaddr ?? '', ...hostaddrs, ...relay_addrs].filter(
        notEmpty => notEmpty
    );
    return res;
}

function websocketAddressFilter(addresses: MultiaddrType[]) {
    const res = WSAllfilter(addresses).filter((addr: MultiaddrType) => {
        // console.log('filter?', addr.toString(), selt.lat);
        return globalSelf.latencySet.has(addr.toString());
    });
    // console.log('ran filter', res);
    return res;
}

const getQuickestPath = (): string | null => {
    let quickest = Infinity;
    let quickestAddr = null;
    for (const [addr, latency] of globalSelf.latencyMap.entries()) {
        if (latency < quickest) {
            quickest = latency;
            quickestAddr = addr;
        }
    }
    return quickestAddr;
};

export default async () => {
    const bootstraplist = await initCheckAddresses(await getBootstrapList());
    console.log('bootstraplist', bootstraplist);
    // await initCheckAddresses(bootstraplist);
    // update status
    status.serverPeer = ServerPeerStatus.BOOTSTRAPPED;

    status.relays.push(...bootstraplist.slice(2));

    // const datastore = new LevelDatastore('./libp2p');
    // await datastore.open(); // level database must be ready before node boot
    const serverID = bootstraplist[0].split('/').pop();
    const node = await createLibp2p({
        // datastore,
        transports: [
            new WebSockets({
                filter: websocketAddressFilter,
            }),
        ],
        connectionEncryption: [new Noise() as unknown as ConnectionEncrypter],
        streamMuxers: [new Mplex() as StreamMuxerFactory],
        peerDiscovery: [
            new Bootstrap({
                list: bootstraplist, // provide array of multiaddrs
            }),
        ],
        connectionManager: {
            autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minConnections)
            minConnections: 3,
            maxDialsPerPeer: 20,
            maxParallelDials: 20,
            addressSorter: publicRelayAddressesFirst,
            // The `tag` property will be searched when creating the instance of your Peer Discovery service.
            // The associated object, will be passed to the service when it is instantiated.
            // dialTimeout: self.DIAL_TIMEOUT,
            // maxParallelDials: 25,
            // maxAddrsToDial: 25,
            // resolvers: {
            //     dnsaddr: dnsaddrResolver,
            //     // ,
            //     // host: hostResolver
            // },
        },
        relay: {
            // Circuit Relay options (this config is part of libp2p core configurations)
            enabled: true, // Allows you to dial and accept relayed connections. Does not make you a relay.
            autoRelay: {
                enabled: true, // Allows you to bind to relays with HOP enabled for improving node dialability
                maxListeners: 5, // Configure maximum number of HOP relays to use
            },
        },
    });

    node.addEventListener('peer:discovery', evt => {
        const peer = evt.detail;
        console.log(`Found peer ${peer.id.toString()}`);
    });

    // Listen for new connections to peers
    let relayDebounce = 0;
    const connectPromise = new Promise<void>((resolve, reject) => {
        try {
            node.connectionManager.addEventListener(
                'peer:connect',
                async evt => {
                    // log connection details
                    const connection = evt.detail;
                    const str_id = connection.remotePeer.toString();
                    console.log(`Connected to: `, {
                        server: str_id,
                        via: connection.remoteAddr.toString(),
                    });
                    // set keep-alive on connection
                    await node.peerStore
                        .tagPeer(connection.remotePeer, KEEP_ALIVE)
                        .catch(_ => null);

                    // if this is not our server
                    const serverMatch = str_id === serverID;
                    console.log(
                        `Server match: ${serverMatch} (${str_id} ${
                            serverMatch ? '=' : '!'
                        }== ${serverID})`
                    );
                    if (!serverMatch) {
                        // then there is no more to do
                        return;
                    } // else, we've connected to our server

                    // update status
                    globalSelf.serverPeer = connection.remotePeer;
                    status.serverPeer = ServerPeerStatus.CONNECTED;

                    if (Date.now() - relayDebounce > 60000) {
                        relayDebounce = Date.now();
                        openRelayStream(() => {
                            /*
                             * Don't wait for a relay before resolving.
                             *
                             * A relay is required in order to access the box
                             * outside of the box's LAN. There are currently
                             * two methods of obtaining a relay: a UPnP address
                             * on the local network and a public UPnP address
                             * on the SamizdApp network; however, both methods
                             * are currently unreliable.
                             *
                             * Until we have a way of reliably obtaining a
                             * public relay, do not wait for a public relay
                             * before resolving.
                             *
                             * TODO: Strengthen one of the methods for
                             * obtaining a public relay address.
                             *
                             */
                            //resolve();
                        });
                    }

                    // TODO: Don't resolve here once we have a reliable way
                    // of obtaining a public relay
                    resolve();
                }
            );
        } catch (e) {
            reject(e);
        }
    });
    // Listen for peers disconnecting
    node.connectionManager.addEventListener('peer:disconnect', evt => {
        const connection = evt.detail;
        console.log(`Disconnected from ${connection.remotePeer.toString()}`);
        if (connection.remotePeer.equals(globalSelf.serverPeer)) {
            console.log('disconnected from server');
            // update status
            status.serverPeer = ServerPeerStatus.CONNECTING;
            node.dial(globalSelf.serverPeer);
        }
    });
    console.debug('starting libp2p');

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    // node.components.setPeerStore(new PersistentPeerStore());
    globalSelf.streamFactory = streamFactoryGenerator();
    // await self.streamFactory.next();
    await node.start();
    console.debug('started libp2p');

    const path = getQuickestPath();
    if (path) {
        node.dial(path as unknown as MultiaddrType);
    }

    // update status
    status.serverPeer = ServerPeerStatus.CONNECTING;

    Promise.race([connectPromise, waitFor(15000)]).then(() => {
        if (status.serverPeer === ServerPeerStatus.CONNECTING) {
            status.serverPeer = ServerPeerStatus.OFFLINE;
        }
    });

    globalSelf.libp2p = globalSelf.node = node;
    return connectPromise;
};
