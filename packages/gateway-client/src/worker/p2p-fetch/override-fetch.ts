import { Buffer } from 'buffer/';
import { pipe } from 'it-pipe';
import type * as it from 'it-stream-types';
import { decode, encode } from 'lob-enc';

import { ServerPeerStatus } from '../../worker-messaging';
import { isBootstrapAppUrl } from '../client';
import { logger } from '../logging';
import { getStream } from '../p2p-client';
import status from '../status';

const log = logger.getLogger('worker/p2p-fetch/override-fetch');

type GlobalSelf = {
    soapstore: LocalForage;
    DIAL_TIMEOUT: number;
    deferral: Promise<unknown>;
    stashedFetch: typeof fetch;
    Buffer: typeof Buffer;
    _fetch: typeof fetch;
    latencyMap: Map<string, number>;
    latencySet: Set<string>;
    pipersInProgress: Map<string, Promise<void>>;
};

const CHUNK_SIZE = 1024 * 64;

const globalSelf = {} as GlobalSelf;

globalSelf.pipersInProgress = new Map();

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

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
        return nativeFetch(givenReqObj, givenReqInit);
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
    // console.log('get fetch stream');

    // console.log('parts:')
    // parts.forEach(p => console.log(p.toString('hex')))
    // let j = 0;
    let done = false;
    let res_parts: Buffer[] = [];
    let floatMax = parts.length * 5000;

    async function piper(piperId: string) {
        const st = Date.now();
        const stream = await getStream('/samizdapp-proxy', piperId);
        console.log('time to stream', Date.now() - st);

        let float = 0,
            t = Date.now(),
            gotFirstChunk = false;
        // console.log('piper parts', parts);
        pipe(
            parts,
            stream as unknown as it.Duplex<Buffer, Buffer>,
            async function gatherResponse(source) {
                for await (const msg of source) {
                    if (gotFirstChunk) {
                        float = Math.max(float, Date.now() - t);
                    } else {
                        console.log('time to first chunk', Date.now() - t);
                        gotFirstChunk = true;
                    }
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

        while (!done) {
            await waitFor(100);
            if (float && Date.now() - t > Math.max(500, float * 4)) {
                console.log('time float', float);
                break;
            }
            if (!float && Date.now() - t > floatMax) {
                console.log('time floatMax', floatMax);
                floatMax += parts.length * 5000;
                break;
            }
            if (status.serverPeer !== ServerPeerStatus.CONNECTED) {
                console.log('time serverPeer', status.serverPeer);
                break;
            }
        }

        stream.close();
        // console.log('piper finish');
    }

    let j = 0;
    while (!done) {
        console.log('try', j++, reqObj.url);
        res_parts = [];
        const piperId = crypto.randomUUID();
        const piperProm = piper(piperId);
        globalSelf.pipersInProgress.set(piperId, piperProm);
        await piperProm;
        globalSelf.pipersInProgress.delete(piperId);
        // await piper();
        console.log('time done', done);
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

export const nativeFetch = self.fetch;

export const overrideFetch = (clientConnected: Promise<void>) => {
    // track client connection
    type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
    let connectionStatus: ConnectionStatus = 'connecting';
    clientConnected
        .then(() => {
            connectionStatus = 'connected';
            log.info('Client connected');
        })
        .catch(e => {
            connectionStatus = 'disconnected';
            log.error('Client connection error: ', e);
        });

    // override fetch
    self.fetch = async (...args) => {
        // if we are connected, use p2p fetch
        if (connectionStatus === 'connected') {
            log.trace('Using p2p fetch: ', args[0]);
            return p2Fetch(...args);
        }

        // else, if we are disconnected, use native fetch
        if (connectionStatus === 'disconnected') {
            log.trace('Using native fetch: ', args[0]);
            return nativeFetch(...args);
        }

        // else, we are still connecting, wait for connection
        log.info('Waiting for client connection, fetch deferred...', args[0]);
        await clientConnected;

        // try again
        log.info('Retrying deferred fetch...', args[0]);
        return self.fetch(...args);
    };
};
