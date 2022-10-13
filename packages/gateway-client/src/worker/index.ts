import { Noise } from '@chainsafe/libp2p-noise';
import { Bootstrap } from '@libp2p/bootstrap';
import { Stream } from '@libp2p/interface-connection';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import { Mplex } from '@libp2p/mplex';
import { WebSockets } from '@libp2p/websockets';
import { all as filter } from '@libp2p/websockets/filters';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import { Buffer } from 'buffer/';
import { LevelDatastore } from 'datastore-level';
import { pipe } from 'it-pipe';
import { createLibp2p, Libp2p } from 'libp2p';
import { decode, encode } from 'lob-enc';
import localforage from 'localforage';
import Multiaddr from 'multiaddr';
// the workbox-precaching import includes a type definition for
// self.__WB_MANIFEST
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { precacheAndRoute, PrecacheEntry } from 'workbox-precaching';
import { PersistentPeerStore } from '@libp2p/peer-store';

// type Window = {
//     localStorage: {
//         debug: string;
//     }
// }

// type Document = {}

declare const self: {
    client?: Client;
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
    // window: Window;
    // document: Document;
} & ServiceWorkerGlobalScope;

self.localforage = localforage;

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

self.DIAL_TIMEOUT = 5000;

self.Multiaddr = Multiaddr;

const CHUNK_SIZE = 1024 * 64;
self.Buffer = Buffer;

self._fetch = fetch;

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
    let streamOrNull: Stream | null = null;
    do {
        const start = Date.now();
        streamOrNull = await Promise.race([
            self.node.dialProtocol(self.serverPeer, protocol).catch(e => {
                console.log('dialProtocol error, retry', e, Date.now() - start);
                return null;
            }),
            new Promise<null>(r =>
                setTimeout(() => r(null), self.DIAL_TIMEOUT)
            ),
        ]);
        if (!streamOrNull) {
            console.log('reset libp2p');
            await self.node.stop();
            await self.node.start();
            const relays =
                (await localforage
                    .getItem<Multiaddr.MultiaddrInput[]>('libp2p.relays')
                    .then(str_array => {
                        return str_array?.map(
                            addr =>
                                Multiaddr.multiaddr(
                                    addr
                                ) as unknown as MultiaddrType
                        );
                    })) ?? [];
            await self.node.peerStore.addressBook.add(self.serverPeer, relays);
        }
    } while (!streamOrNull);

    return streamOrNull;
}

self.getStream = getStream;

async function p2Fetch(
    reqObj: URL | RequestInfo,
    reqInit: RequestInit | undefined = {},
    _xhr?: XMLHttpRequest
): Promise<Response> {
    reqObj = reqObj as Request;
    if (typeof reqObj.url != 'string') {
        throw new Error(
            `Patched service worker \`fetch()\` method expects a full request object, received ${reqObj.constructor.name}`
        );
    }
    const patched = patchFetchArgs(reqObj, reqInit);
    const body = reqObj.body
        ? reqObj.body
        : reqInit.body
        ? reqInit.body
        : reqObj.arrayBuffer
        ? await reqObj.arrayBuffer()
        : null;

    reqObj = patched.reqObj;
    reqInit = patched.reqInit;
    // console.log("pocketFetch2", reqObj, reqInit, body);
    //delete (reqObj as Request).body;
    delete reqInit?.body;
    const pbody = await normalizeBody(body);
    const packet = encode({ reqObj, reqInit }, pbody);
    // console.log('packet:', packet.toString('hex'))

    // console.log('packet?', packet)
    const stream = await getStream();

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
    // console.log('parts:')
    // parts.forEach(p => console.log(p.toString('hex')))

    return new Promise((resolve, reject) => {
        let done = false;
        try {
            pipe(parts, stream, async function (source) {
                const parts = [];
                for await (const msg of source) {
                    const buf = Buffer.from(msg.subarray());
                    if (msg.subarray().length === 1 && buf[0] === 0x00) {
                        const resp = decode(Buffer.concat(parts));
                        if (!resp.json.res) {
                            return reject(resp.json.error);
                        }
                        resp.json.res.headers = new Headers(
                            resp.json.res.headers
                        );
                        // alert("complete");
                        done = true;
                        resolve(new Response(resp.body, resp.json.res));
                        stream.close();
                    } else {
                        parts.push(buf);
                    }
                }
            });
        } catch (e) {
            console.warn(e);
            if (!done) {
                p2Fetch(reqObj, reqInit).then(resolve).catch(reject);
            }
        }
    });
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

    const url = new URL(
        _reqObj.url.startsWith('http')
            ? _reqObj.url
            : `http://localhost${_reqObj.url}`
    );

    const rawHeaders = Object.fromEntries(_reqObj.headers.entries());

    if (url.pathname !== '/manifest.json') {
        rawHeaders['X-Intercepted-Subdomain'] = 'pleroma';
    }

    if (url.host === getHost()) {
        // console.log("subdomain", _reqInit);
        url.host = 'localhost';
        url.protocol = 'http:';
        url.port = '80';
    }

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
        url: url.toString(),
    } as unknown as Request;

    const reqInit = {
        ..._reqInit,
        headers: rawHeaders,
    };

    return { reqObj, reqInit };
}

async function openRelayStream(cb: () => unknown) {
    while (true) {
        const stream = await getStream('/samizdapp-relay').catch(e => {
            console.error('error getting stream', e);
        });
        if (!stream) {
            return;
        }
        console.log('got relay stream');
        await pipe(stream.source, async function (source) {
            for await (const msg of source) {
                const str_relay = Buffer.from(msg.subarray()).toString();
                const multiaddr = Multiaddr.multiaddr(
                    str_relay
                ) as unknown as MultiaddrType;
                console.log('got relay multiaddr', multiaddr.toString());
                await localforage
                    .getItem<string[]>('libp2p.relays')
                    .then(str_array => {
                        return localforage.setItem('libp2p.relays', [
                            str_relay,
                            ...(str_array || []),
                        ]);
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
                cb();
            }
        }).catch(e => {
            console.log('error in pipe', e);
        });
    }
}

async function main() {
    // self.window.localStorage.debug = (await localforage.getItem('debug')) || ""

    const bootstrapaddr =
        (await localforage.getItem<string>('libp2p.bootstrap')) ||
        (await fetch('/pwa/assets/libp2p.bootstrap')
            .then(r => r.text())
            .then(async id => {
                await localforage.setItem('libp2p.bootstrap', id);
                return id;
            }));

    console.debug('got bootstrap addr', bootstrapaddr);
    const relay_addrs =
        (await localforage.getItem<string[]>('libp2p.relays').catch(_ => [])) ??
        [];
    console.debug('got relay addrs', relay_addrs);
    const { hostname } = new URL(self.origin);
    const [_, _proto, _ip, ...rest] = bootstrapaddr?.split('/') ?? [];
    const hostaddr = `/dns4/${hostname}/${rest.join('/')}`;
    const bootstraplist = [bootstrapaddr ?? '', hostaddr, ...relay_addrs];
    const datastore = new LevelDatastore('./libp2p');
    await datastore.open(); // level database must be ready before node boot
    const serverID = bootstrapaddr?.split('/').pop();
    const node = await createLibp2p({
        datastore,
        transports: [
            new WebSockets({
                filter,
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
            minConnections: 0,
            maxDialsPerPeer: 10,
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
    // Listen for new peers
    let foundServer = false;
    node.addEventListener('peer:discovery', evt => {
        const peer = evt.detail;
        console.log(`Found peer ${peer.id.toString()}`);
        // peer.multiaddrs.forEach(ma => console.log(ma.toString()))
        // console.log(peer)
        if (peer.id.toString() === serverID && !foundServer) {
            foundServer = true;
            node.ping(peer.id);
        }
    });
    node.peerStore.addEventListener('change:multiaddrs', evt => {
        // Updated self multiaddrs?
        // if (evt.detail.peerId.equals(node.peerId)) {
        console.log(`updated addresses for ${evt.detail.peerId.toString()}`);
        console.log(evt.detail);
        // }
    });
    // Listen for new connections to peers
    let serverConnected = false;
    const connectPromise = new Promise<void>((resolve, reject) => {
        try {
            node.connectionManager.addEventListener(
                'peer:connect',
                async evt => {
                    const connection = evt.detail;
                    const str_id = connection.remotePeer.toString();
                    console.log(
                        `Connected to ${str_id}, check ${serverID}, serverConnected ${serverConnected}`
                    );
                    if (str_id === serverID && !serverConnected) {
                        serverConnected = true;
                        self.serverPeer = connection.remotePeer;
                        openRelayStream(() => {
                            resolve();
                        });
                    }
                    // while (true) {
                    //   await new Promise(r => setTimeout(r, 5000))
                    //   await node.ping(connection.remotePeer).catch(async e => {
                    //     await node.stop()
                    //     await node.start()
                    //   })
                    // }
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
    await node.start();
    console.debug('started libp2p');
    self.libp2p = self.node = node;
    return connectPromise;
}

self.addEventListener('fetch', function (event) {
    console.log('Received fetch: ', event);

    // // if this url is in the manifest
    // if (wbManifestUrls.includes(event.request.url)) {
    //     // then use our default fetch to fetch it

    // }

    //if (event?.request.method !== 'GET') {
    // default service worker only handles GET
    event?.respondWith(fetch(event.request));
    //}
});

self.addEventListener('online', () => console.log('<<<<online'));
self.addEventListener('offline', () => console.log('<<<<offline'));

self.addEventListener('message', async function (evt) {
    console.log('postMessage received', evt);
    if (evt.data.type === 'MDNS') {
        const address = evt.data.address;
        localforage.setItem('mdns', { address });
    }

    localforage.setItem('started', { started: true });
    await navToRoot();
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
    await self.deferral;
    console.log('fetch deferred', args[0]);
    return self.fetch(...args);
};

async function navToRoot() {
    const clienttab = (await self.clients.matchAll()).filter(({ url }) => {
        const u = new URL(url);
        return u.pathname === '/pwa';
    })[0] as WindowClient;

    if (clienttab) {
        clienttab.navigate('/').catch(_e => {
            clienttab.postMessage('NAVIGATE');
        });
    }
}

console.log('end of worker/index.js');
