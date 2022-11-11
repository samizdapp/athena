import { Noise } from '@chainsafe/libp2p-noise';
import { Bootstrap } from '@libp2p/bootstrap';
import { Stream } from '@libp2p/interface-connection';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import type { Address } from '@libp2p/interface-peer-store';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import * as libp2pLogger from '@libp2p/logger';
import { Mplex } from '@libp2p/mplex';
import { PersistentPeerStore } from '@libp2p/peer-store';
import { isLoopback } from '@libp2p/utils/multiaddr/is-loopback';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private';
import { WebSockets } from '@libp2p/websockets';
import { all as WSAllfilter } from '@libp2p/websockets/filters';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import { Buffer } from 'buffer/';
import { LevelDatastore } from 'datastore-level';
import { pipe } from 'it-pipe';
import { createLibp2p, Libp2p } from 'libp2p';
import { decode, encode } from 'lob-enc';
import localforage from 'localforage';
import Multiaddr from 'multiaddr';
import * as workboxPrecaching from 'workbox-precaching';
import { KEEP_ALIVE } from '@libp2p/interface-peer-store/tags';
import type * as it from 'it-stream-types';
import {
    WorkerMessageType,
    ServerPeerStatus,
    Message,
    ClientMessageType,
} from '../service-worker';
import { connect } from 'http2';
import { Duplex } from 'stream';

// the workbox-precaching import includes a type definition for
// <self dot __WB_MANIFEST>.
// Import it even though we're not using any of the imports,
// and mark the import as being used with this line:
const _ = workboxPrecaching;

// type Window = {
//     localStorage: {
//         debug: string;
//     }
// }

// type Document = {}

enum LogLevel {
    OFF = 'OFF',
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
    DEBUG = 'DEBUG',
    TRACE = 'TRACE',
}

declare const self: {
    status: WorkerStatus;
    soapstore: LocalForage;
    DIAL_TIMEOUT: number;
    serverPeer: PeerId;
    node: Libp2p;
    libp2p: Libp2p;
    deferral: Promise<unknown>;
    stashedFetch: typeof fetch;
    Buffer: typeof Buffer;
    Multiaddr: typeof Multiaddr;
    _fetch: typeof fetch;
    getStream: typeof getStream;
    localforage: typeof localforage;
    streamFactory: AsyncGenerator<StreamMaker, void, string | undefined>;
    // window: Window;
    // document: Document;
    libp2pSetLogLevel: (level: LogLevel) => void;
    latencyMap: Map<string, number>;
    latencySet: Set<string>;
} & ServiceWorkerGlobalScope;

self.latencyMap = new Map();
self.latencySet = new Set();

self.libp2pSetLogLevel = (level: LogLevel) => {
    const levelHandlers: Record<LogLevel, (extra?: string) => void> = {
        OFF: () => libp2pLogger.disable(),
        ERROR: extra =>
            libp2pLogger.enable(
                'libp2p:circuit:error, libp2p:bootstrap:error, libp2p:upgrader:error, ' +
                    extra
            ),
        WARN: extra => levelHandlers.ERROR('libp2p:websockets:error, ' + extra),
        INFO: extra =>
            levelHandlers.WARN(
                'libp2p:dialer:error, libp2p:connection-manager:trace, ' + extra
            ),
        DEBUG: extra =>
            levelHandlers.INFO(
                'libp2p:peer-store:trace, libp2p:mplex:stream:trace, libp2p:*:error, ' +
                    extra
            ),
        TRACE: extra => levelHandlers.DEBUG('libp2p:*:trace, ' + extra),
    };

    levelHandlers[level]();
};

self.libp2pSetLogLevel(LogLevel.ERROR);

// slightly modified version of
// https://github.com/libp2p/js-libp2p-utils/blob/66e604cb0bfcf686eb68e44f278d62e3464c827c/src/address-sort.ts
// the goal here is to couple prioritizing relays with parallelism
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
self.addrSort = publicRelayAddressesFirst;
function publicRelayAddressesFirst(a: Address, b: Address): -1 | 0 | 1 {
    // console.log('spam sort', a.multiaddr.toString(), b.multiaddr.toString());
    const haveLatencyA = self.latencyMap.has(a.multiaddr.toString());
    const haveLatencyB = self.latencyMap.has(b.multiaddr.toString());

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
            self.latencyMap.get(a.multiaddr.toString()) || Infinity;
        const latencyB =
            self.latencyMap.get(b.multiaddr.toString()) || Infinity;
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
self.localforage = localforage;

async function getWSOpenLatency(ma: string): Promise<number> {
    return new Promise(resolve => {
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

async function checkAddress(address: string): Promise<void> {
    const latency = await getWSOpenLatency(address);
    // console.log('spam latency', address, latency);
    if (latency < Infinity) {
        self.latencyMap.set(address, latency);
        self.latencySet.add(address.split('/p2p-circuit')[0]);
    }
}

async function initCheckAddresses(addresses: string[]): Promise<void> {
    self.latencyMap = new Map();
    self.latencySet = new Set();
    await Promise.race([
        Promise.all(addresses.map(checkAddress)),
        waitFor(1000),
    ]);
}

const WB_MANIFEST = self.__WB_MANIFEST;
// const wbManifestUrls = WB_MANIFEST.map(it =>
//     (it as PrecacheEntry).revision ? (it as PrecacheEntry).url : it
// );

// self.window = { localStorage: { debug: '' } }
// self.document = {}

// Precache all of the assets generated by your build process.
// Their URLs are injected into the manifest variable below.
// This variable must be present somewhere in your service worker file,
// even if you decide not to use precaching. See https://cra.link/PWA
//precacheAndRoute(WB_MANIFEST);
console.log(WB_MANIFEST);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
self.setImmediate = (fn: () => void) => self.setTimeout(fn, 0);

// To disable all workbox logging during development, you can set self.__WB_DISABLE_DEV_LOGS to true
// https://developers.google.com/web/tools/workbox/guides/configure-workbox#disable_logging
//
// self.__WB_DISABLE_DEV_LOGS = true

self.DIAL_TIMEOUT = 2000;

self.Multiaddr = Multiaddr;

const CHUNK_SIZE = 1024 * 8;
self.Buffer = Buffer;

self._fetch = fetch;

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

type StreamMaker = (protocol: string) => Promise<Stream>;

async function* streamFactoryGenerator(): AsyncGenerator<
    StreamMaker,
    void,
    string | undefined
> {
    let locked = false;

    const makeStream: StreamMaker = async function (protocol) {
        // console.log('get protocol stream', protocol)
        let dialTimeout = self.DIAL_TIMEOUT;
        let retryTimeout = 0;
        let streamOrNull = null;
        while (!streamOrNull) {
            while (locked) {
                await waitFor(100);
            }
            // attempt to dial our peer, track the time it takes
            const start = Date.now();
            streamOrNull = await Promise.race([
                self.node.dialProtocol(self.serverPeer, protocol).catch(_ => {
                    // console.log('dialProtocol error, retry', Date.now() - start);
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
                    self.DIAL_TIMEOUT,
                    Math.floor((Date.now() - start) * 1.5)
                );
                retryTimeout = 0;
                // if we were NOT previously connected
                if (self.status.serverPeer !== ServerPeerStatus.CONNECTED) {
                    // we are now
                    self.status.serverPeer = ServerPeerStatus.CONNECTED;
                }
                // we have a stream, we can quit now
                // console.log('got stream', protocol, streamOrNull)
                break;
            } // else, we were not able to successfully dial

            // this is a connection error, if we were previously connected
            if (self.status.serverPeer === ServerPeerStatus.CONNECTED) {
                // we aren't anymore
                self.status.serverPeer = ServerPeerStatus.CONNECTING;
            }

            // if our retry timeout reaches 5 seconds, then we'll have
            // been retrying for 15 seconds (triangle number of 5).
            // By this point, we're probably offline.
            if (
                self.status.serverPeer !== ServerPeerStatus.OFFLINE &&
                retryTimeout >= 5000
            ) {
                self.status.serverPeer = ServerPeerStatus.OFFLINE;
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
            if (!locked) {
                locked = true;
                const _s = Date.now();
                const bootstraplist = await getBootstrapList(true);
                await initCheckAddresses(bootstraplist);

                await self.node.stop();
                await self.node.start();
                const relays = bootstraplist.map(
                    s => Multiaddr.multiaddr(s) as unknown as MultiaddrType
                );
                await self.node.peerStore.addressBook.add(
                    self.serverPeer,
                    relays
                );
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
class WorkerStatus {
    _serverPeer: ServerPeerStatus | null = null;
    relays: string[] = [];

    constructor() {
        Reflect.defineProperty(this.relays, 'push', {
            value: (...items: string[]): number => {
                const ret = Array.prototype.push.call(this.relays, ...items);
                getClient().then(client => {
                    client?.postMessage({
                        type: WorkerMessageType.LOADED_RELAYS,
                        relays: this.relays,
                    });
                });
                return ret;
            },
        });
    }

    get serverPeer() {
        return this._serverPeer;
    }

    set serverPeer(status: ServerPeerStatus | null) {
        this._serverPeer = status;
        getClient().then(client => {
            client?.postMessage({
                type: WorkerMessageType.SERVER_PEER_STATUS,
                status,
            });
        });
    }

    async sendCurrent() {
        const client = await getClient();
        client?.postMessage({
            type: WorkerMessageType.LOADED_RELAYS,
            relays: this.relays,
        });
        client?.postMessage({
            type: WorkerMessageType.SERVER_PEER_STATUS,
            status: this.serverPeer,
        });
    }
}
self.status = new WorkerStatus();

const isBootstrapAppUrl = (url: URL): boolean =>
    url.pathname.startsWith('/smz/pwa');

const getClient = async (): Promise<WindowClient | undefined> => {
    const allClients = await self.clients.matchAll();
    return allClients.find(
        it => it instanceof WindowClient && isBootstrapAppUrl(new URL(it.url))
    ) as WindowClient;
};

async function normalizeBody(body: unknown) {
    try {
        if (!body) return undefined;
        if (typeof body === 'string') return Buffer.from(body);
        if (Buffer.isBuffer(body)) return body;
        if (body instanceof ArrayBuffer) {
            if (body.byteLength > 0) return Buffer.from(new Uint8Array(body));
            return undefined;
        }
        type WithArrayBuffer = { arrayBuffer: () => Promise<ArrayBufferLike> };
        if ((body as WithArrayBuffer).arrayBuffer) {
            return Buffer.from(
                new Uint8Array(await (body as WithArrayBuffer).arrayBuffer())
            );
        }
        if ((body as ReadableStream).toString() === '[object ReadableStream]') {
            const reader = (body as ReadableStream).getReader();
            const chunks = [];
            let _done = false;
            do {
                const { done, value } = await reader.read();
                _done = done;
                chunks.push(Buffer.from(new Uint8Array(value)));
            } while (!_done);
            return Buffer.concat(chunks);
        }

        throw new Error(`don't know how to handle body`);
    } catch (e) {
        return Buffer.from(
            `${(e as Error).message} ${typeof body} ${(
                body as string
            ).toString()} ${JSON.stringify(body)}`
        );
    }
}

async function getStream(protocol = '/samizdapp-proxy') {
    const { value } = await self.streamFactory.next();

    const makeStream = value as StreamMaker;
    return makeStream(protocol);
}

self.getStream = getStream;

async function p2Fetch(
    givenReqObj: URL | RequestInfo,
    givenReqInit: RequestInit | undefined = {},
    _xhr?: XMLHttpRequest
): Promise<Response> {
    // assert that we were given a request
    givenReqObj = givenReqObj as Request;

    if (typeof givenReqObj.url != 'string') {
        throw new Error(
            `Patched service worker \`fetch()\` method expects a full request object, received ${givenReqObj.constructor.name}`
        );
    }

    // patch args
    const body =
        givenReqObj.body ??
        givenReqInit.body ??
        (await givenReqObj.arrayBuffer?.()) ??
        null;
    const { reqObj, reqInit } = patchFetchArgs(givenReqObj, givenReqInit);

    // apply filtering to the request
    const url = new URL(
        reqObj.url.startsWith('http')
            ? reqObj.url
            : `http://localhost${reqObj.url}`
    );

    if (process.env.NX_LOCAL === 'true' && isBootstrapAppUrl(url)) {
        return self.stashedFetch(givenReqObj, givenReqInit);
    }

    if (url.pathname.startsWith('/smz')) {
        reqObj.headers['X-Intercepted-Subdomain'] = 'samizdapp';
    } else if (url.pathname !== '/manifest.json') {
        reqObj.headers['X-Intercepted-Subdomain'] = 'pleroma';
    }

    if (url.host === getHost()) {
        url.host = 'localhost';
        url.protocol = 'http:';
        url.port = '80';
    }

    reqObj.url = url.toString();

    // console.log("pocketFetch2", reqObj, reqInit, body);
    //delete (reqObj as Request).body;
    delete reqInit?.body;
    const pbody = await normalizeBody(body);
    const packet = encode({ reqObj, reqInit }, pbody);
    // console.log('packet:', packet.toString('hex'))
    let i = 0;
    const parts: Buffer[] = [];
    for (; i <= Math.floor(packet.length / CHUNK_SIZE); i++) {
        parts.push(
            packet.slice(
                i * CHUNK_SIZE,
                (i + 1) * CHUNK_SIZE
            ) as unknown as Buffer
        );
    }

    parts.push(Buffer.from([0x00]));
    // console.log('packet?', packet)
    console.log('get fetch stream');
    console.log('got fetch stream');

    // console.log('parts:')
    // parts.forEach(p => console.log(p.toString('hex')))
    let j = 0;
    let done = false;
    let res_parts: Buffer[] = [];

    async function piper() {
        const stream = await getStream();

        let float = 0,
            t = Date.now();
        // console.log('piper parts', parts);
        pipe(
            parts,
            stream as unknown as it.Duplex<Buffer, Buffer>,
            async function gatherResponse(source) {
                for await (const msg of source) {
                    float = Math.max(float, Date.now() - t);
                    console.log('piper float', float);
                    t = Date.now();
                    const buf = Buffer.from(msg.subarray());
                    if (msg.subarray().length === 1 && buf[0] === 0x00) {
                        done = true;
                    } else {
                        res_parts.push(buf);
                    }
                }
            }
        );

        while (!done && (!float || Date.now() - t < float * 2)) {
            console.log('piper wait', done, float, Date.now() - t, float * 2);
            await waitFor(100);
            if (!float && Date.now() - t > 10000) {
                break;
            }
            if (self.status.serverPeer !== ServerPeerStatus.CONNECTED) {
                break;
            }
        }

        stream.close();
        console.log('piper finish');
    }

    while (!done) {
        console.log('try', j++, reqObj.url);
        res_parts = [];
        await piper();
        console.log('piper finished', done);
    }

    const resp = decode(Buffer.concat(res_parts));
    if (!resp.json.res) {
        throw resp.json.error;
    }
    resp.json.res.headers = new Headers(resp.json.res.headers);
    // alert("complete");
    return new Response(resp.body, resp.json.res);
}

const getHost = () => {
    try {
        return window.location.host;
    } catch (e) {
        return self.location.host;
    }
};

function patchFetchArgs(_reqObj: Request, _reqInit: RequestInit = {}) {
    // console.log("patch");

    const rawHeaders = Object.fromEntries(_reqObj.headers.entries());

    const reqObj = {
        bodyUsed: _reqObj.bodyUsed,
        cache: _reqObj.cache,
        credentials: _reqObj.credentials,
        destination: _reqObj.destination,
        headers: rawHeaders,
        integrity: _reqObj.integrity,
        isHistoryNavigation: (
            _reqObj as Request & { isHistoryNavigation: boolean }
        ).isHistoryNavigation,
        keepalive: _reqObj.keepalive,
        method: _reqObj.method,
        mode: _reqObj.mode,
        redirect: _reqObj.redirect,
        referrer: _reqObj.referrer,
        referrerPolicy: _reqObj.referrerPolicy,
        url: _reqObj.url,
    };

    const reqInit = {
        ..._reqInit,
        headers: rawHeaders,
    };

    return { reqObj, reqInit };
}

async function openRelayStream(cb: () => unknown) {
    const stream = await getStream('/samizdapp-relay').catch(e => {
        console.error('error getting stream', e);
    });
    if (!stream) {
        return;
    }
    // console.log('got relay stream');
    await pipe(stream.source, async function (source) {
        for await (const msg of source) {
            const str_relay = Buffer.from(msg.subarray()).toString();
            const multiaddr = Multiaddr.multiaddr(
                str_relay
            ) as unknown as MultiaddrType;
            console.log('got relay multiaddr', multiaddr.toString());
            if (!self.latencyMap.has(multiaddr.toString())) {
                await checkAddress(multiaddr.toString());
            }
            await localforage
                .getItem<string[]>('libp2p.relays')
                .then(str_array => {
                    const dedup = Array.from(
                        new Set([str_relay, ...(str_array || [])])
                    );

                    return localforage.setItem('libp2p.relays', dedup);
                });
            await self.node.peerStore.addressBook
                .add(self.serverPeer, [multiaddr])
                .catch(e => {
                    console.warn(
                        'error adding multiaddr',
                        multiaddr.toString()
                    );
                    console.error(e);
                });

            // update status
            self.status.relays.push(str_relay);

            cb();
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
            newBootstrapAddress = await self
                .stashedFetch('/smz/pwa/assets/libp2p.bootstrap')
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
        // console.log('filter?', addr.toString());
        return self.latencySet.has(addr.toString());
    });
    // console.log('ran filter', res);
    return res;
}

async function main() {
    // self.window.localStorage.debug = (await localforage.getItem('debug')) || ""

    const bootstraplist = await getBootstrapList();
    initCheckAddresses(bootstraplist);
    // update status
    self.status.serverPeer = ServerPeerStatus.BOOTSTRAPPED;

    self.status.relays.push(...bootstraplist.slice(2));

    const datastore = new LevelDatastore('./libp2p');
    await datastore.open(); // level database must be ready before node boot
    const serverID = bootstraplist[0].split('/').pop();
    const node = await createLibp2p({
        datastore,
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
                    const connection = evt.detail;
                    const str_id = connection.remotePeer.toString();
                    console.log(`Connected to ${str_id}, check ${serverID}`);
                    await node.peerStore
                        .tagPeer(connection.remotePeer, KEEP_ALIVE)
                        .catch(_ => null);
                    if (str_id === serverID) {
                        // update status

                        self.serverPeer = connection.remotePeer;
                        self.status.serverPeer = ServerPeerStatus.CONNECTED;

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
    });
    console.debug('starting libp2p');

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    node.components.setPeerStore(new PersistentPeerStore());
    self.streamFactory = streamFactoryGenerator();
    // await self.streamFactory.next();
    await node.start();
    console.debug('started libp2p');

    // update status
    self.status.serverPeer = ServerPeerStatus.CONNECTING;

    Promise.race([connectPromise, waitFor(15000)]).then(() => {
        if (self.status.serverPeer === ServerPeerStatus.CONNECTING) {
            self.status.serverPeer = ServerPeerStatus.OFFLINE;
        }
    });

    self.libp2p = self.node = node;
    return connectPromise;
}

const maybeNavigateToFediverse = async (event: FetchEvent) => {
    const { pathname, searchParams } = new URL(event.request.url);
    if (pathname === '/api/v1/timelines/public' && searchParams.get('local')) {
        const allClients = await self.clients.matchAll();
        const atPleromaPage = allClients.find(
            it =>
                it instanceof WindowClient &&
                new URL(it.url).pathname === '/timeline/local'
        ) as WindowClient;

        if (atPleromaPage) {
            atPleromaPage.navigate('/timeline/fediverse');
        }
    }
};

self.addEventListener('fetch', function (event) {
    // console.log('Received fetch: ', event);

    // Check if this is a request for a static asset
    // console.log('destination', event.request.destination, event.request)
    if (
        [
            'audio',
            'audioworklet',
            'document',
            'font',
            'image',
            'paintworklet',
            'report',
            'script',
            'style',
            'track',
            'video',
            'xslt',
        ].includes(event.request.destination) ||
        // this directory doesn't have a usable destination string, but it's static assets
        event.request.url.includes('/packs/icons/')
    ) {
        event.respondWith(
            caches.open('pwa-static-cache').then(cache => {
                // Go to the cache first
                return cache.match(event.request.url).then(cachedResponse => {
                    // Return a cached response if we have one
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // Otherwise, hit the network
                    return fetch(event.request).then(fetchedResponse => {
                        // Add the network response to the cache for later visits
                        cache.put(event.request, fetchedResponse.clone());

                        // Return the network response
                        return fetchedResponse;
                    });
                });
            })
        );
    } else {
        maybeNavigateToFediverse(event);
        event?.respondWith(fetch(event.request));
    }
});

self.addEventListener('online', () => console.log('<<<<online'));
self.addEventListener('offline', () => console.log('<<<<offline'));

type MessageHandlers = Record<
    ClientMessageType,
    (
        msg: Message<ClientMessageType>,
        port: readonly MessagePort[] | undefined
    ) => void
>;

const messageHandlers: MessageHandlers = {
    REQUEST_STATUS: () => self.status.sendCurrent(),
    OPENED: () => localforage.setItem('started', { started: true }),
};

self.addEventListener('message', (e: ExtendableMessageEvent) => {
    console.log('postMessage received', e);

    const msg = e.data as Message<ClientMessageType>;
    if (!ClientMessageType[msg.type]) {
        console.warn('Ignoring client message with unknown type: ' + msg.type);
        return;
    }
    messageHandlers[msg.type](msg, e.ports);
});

self.addEventListener('install', _event => {
    // The promise that skipWaiting() returns can be safely ignored.
    console.log('got install');
    self.skipWaiting();

    // Perform any other actions required for your
    // service worker to install, potentially inside
    // of event.waitUntil();
    console.log('Skipped waiting');
});

self.addEventListener('activate', async _event => {
    console.log('got activate');
    // self.stashedFetch = self.fetch;

    // self.deferral = main().then(() => {
    //     console.log('patching fetch');
    //     self.fetch = p2Fetch.bind(self);
    // }).catch(e => {
    //     console.error(e)
    //     self.fetch = self.stashedFetch.bind(self)
    // });

    // self.fetch = async (...args) => {
    //     if (typeof args[0] === 'string') {
    //         return self.stashedFetch(...args);
    //     }
    //     console.log('fetch waiting for deferral', args[0]);
    //     await self.deferral;
    //     console.log('fetch deferred', args[0]);
    //     return self.fetch(...args);
    // };
    await self.clients.claim();

    // send status update to our client
    self.status.sendCurrent();

    console.log('Finish clients claim');
});

self.stashedFetch = self.fetch;

self.deferral = main()
    .then(() => {
        console.log('patching fetch');
        self.fetch = p2Fetch.bind(self);
    })
    .catch(e => {
        console.error(e);
        self.fetch = self.stashedFetch.bind(self);
    });

self.fetch = async (...args) => {
    if (typeof args[0] === 'string') {
        return self.stashedFetch(...args);
    }
    console.log('fetch waiting for deferral', args[0]);

    // Safari iOS needs a kick in the pants when PWA is installed
    // very hard to debug what's going wrong because impossible
    // to attach devtools to the service worker of an installed PWA
    // but this seems to fix it

    // However, it unfortunately broke the worker on Chrome due to some sort
    // of a race condition between libp2p being created and this loop firing,
    // so it is being commented out for now.

    // const whip = setTimeout(async () => {
    //     const bootstraplist = await getBootstrapList();
    //     for (const ma of bootstraplist) {
    //         await self.libp2p?.dial(ma as unknown as PeerId).catch(e => null);
    //     }
    // }, 100);

    await self.deferral;

    //clearTimeout(whip);

    console.log('fetch deferred', args[0]);
    return self.fetch(...args);
};

console.log('end of worker/index.js');
