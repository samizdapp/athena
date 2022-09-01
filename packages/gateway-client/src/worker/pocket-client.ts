import { encode, decode } from 'lob-enc';
import { WSClient } from 'pocket-sockets';
import {
    Messaging,
    once,
    init,
    genKeyPair,
    HandshakeAsClient,
} from 'pocket-messaging';
import localforage from 'localforage';
import type EventEmitter from 'eventemitter3';

declare const self: ServiceWorkerGlobalScope;

const CHUNK_SIZE = 65535;

function getRandomArbitrary(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function randomRoute() {
    let r = '';
    for (let i = 0; i < 4; i++) {
        r += String.fromCharCode(getRandomArbitrary(97, 122));
    }
    return r;
}

const getWSAddress = async () => {
    const { address } = (await localforage.getItem('mdns')) || {};
    if (address) return address;

    try {
        return window.location.hostname;
    } catch (e) {
        return self.location.hostname;
    }
};

const getHost = () => {
    try {
        return window.location.host;
    } catch (e) {
        return self.location.host;
    }
};

type EnhancedMessaging = {
    address?: string;
    alive?: () => Promise<unknown>;
    onClose?: () => unknown;
} & Messaging;

class ClientManager {
    _host: string;
    _port: number;
    _addresses: Set<string>;
    _job: Promise<unknown>;
    _gettingClient = false;
    _getClientLock = false;

    _client?: EnhancedMessaging;

    ORIGIN: string;
    keyPairClient?: ReturnType<typeof genKeyPair>;

    constructor({ host, port }: { host: string; port: number }) {
        //this._host = getHost();
        this._host = host;
        this._port = port;
        this._addresses = new Set();
        this._job = Promise.resolve();

        this.ORIGIN = `${this._host}:${this._port}`;
    }

    addAddress(address: string) {
        this._addresses.add(address);
    }

    async init() {
        await init();
        this.keyPairClient = await genKeyPair();
    }

    async createClient(address: string): Promise<EnhancedMessaging> {
        return new Promise((resolve, reject) => {
            const [host, port] = address.split(':');
            console.log('create client', host, port);
            let client: EnhancedMessaging;
            const _client = new WSClient({
                host,
                port: parseInt(port),
            });

            _client.onConnect(async () => {
                console.log('onConnect');

                client = new Messaging(_client);

                const { skey, dis } = await new Promise((resolve, reject) => {
                    const hsfn = (buf: Buffer) => {
                        console.log('got client data', buf.toString());
                        try {
                            _client.offData(hsfn);
                            resolve(JSON.parse(buf.toString()));
                        } catch (e) {
                            console.warn(e);
                        }
                    };
                    _client.onData(hsfn);
                    _client.onError(reject);
                    _client.sendString('handshake');
                });

                console.log('client hs start');

                const hs = await HandshakeAsClient(
                    _client,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
                    this.keyPairClient?.secretKey!,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
                    this.keyPairClient?.publicKey!,
                    Buffer.from(skey, 'base64'),
                    Buffer.from(dis)
                );

                // alert("client hs finished");
                client.setEncrypted(
                    hs.clientToServerKey,
                    hs.clientNonce,
                    hs.serverToClientKey,
                    hs.serverNonce,
                    hs.peerLongtermPk
                );
                client.open();

                client.address = address;
                // alert(`resolve ${address}`);
                client.alive = async () => {
                    console.log('send keepalive');
                    const timeout = new Promise(r =>
                        setTimeout(() => r('timeout'), 5000)
                    );
                    const sendres = client.send(
                        'ping',
                        Buffer.from('deadbeef', 'hex'),
                        5000,
                        true
                    );

                    console.log('sent ping', sendres);
                    if (!(sendres && sendres.eventEmitter)) {
                        return false;
                    }

                    const { eventEmitter } = sendres;

                    console.log('await response');
                    const res = await Promise.race([
                        timeout,
                        once(eventEmitter, 'reply'),
                    ]);
                    if (res === 'timeout') {
                        console.log('timeout');
                        return false;
                    }

                    console.log('is alive');
                    return true;
                };
                resolve(client);
            });

            _client.onError((e: Error) => {
                if (client) {
                    client.close();
                }
                console.warn(`error connecting ${address}`);
                reject(e);
            });

            _client.onClose(() => {
                if (client) {
                    console.log('client closed');
                    if (client.onClose) client.onClose();
                    client.close();
                    this._gettingClient = false;
                    // this.getClient();
                }
                // alert(`closed ${address}`);
            });

            try {
                _client.connect();
            } catch (e) {
                reject(e);
            }
        });
    }

    async raceNewClients(): Promise<EnhancedMessaging | undefined> {
        return Promise.race(
            (await this.getAddresses()).map(address =>
                this.createClient(address).catch(e => {
                    console.debug('failed to get client for ' + address);
                    console.debug(e);
                    return new Promise(r =>
                        setTimeout(() => r(undefined), 5000)
                    ) as Promise<undefined>;
                })
            )
        );
    }

    async getClient() {
        while (this._getClientLock) {
            await new Promise(r => setTimeout(r, 100));
        }
        this._getClientLock = true;

        while (!this._client || !(await this._client?.alive?.())) {
            this._client = await this.raceNewClients();
        }

        this._getClientLock = false;
        return this._client;
    }

    // async getClient() {
    //   if (!this._gettingClient) {
    //     this._gettingClient = true;
    //     this._client =
    //       this._client ||
    //       (await this.createClient(`${this._host}:${this._port}`));
    //   }
    //   while (!this._client) {
    //     await new Promise((r) => setTimeout(r, 50));
    //   }

    //   return this._client;
    // }

    async getAddresses() {
        const lanwan = Array.from(this._addresses);
        return lanwan.concat([
            `${await getWSAddress()}:${this._port}`,
            `setup.local:${this._port}`,
            `setup.localhost:${this._port}`,
        ]);
        // const domain = [`${this._host}:${this._port}`]
        // return lanwan.length ? lanwan.concat : domain;
    }

    async connect(_address: string) {
        //if (this.isConnected(address)) return;
    }
}

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
        if (
            typeof body === 'object' &&
            (body as WithArrayBuffer)?.arrayBuffer
        ) {
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

export type Address = {
    lan: string;
    wan: string;
};

declare global {
    interface XMLHttpRequest {
        _headers: Record<string, string>;
        _method: string;
        _url: string | URL;
    }
}

export default class PocketClient {
    _host: string;
    _port: number;
    _clientManager: ClientManager;
    onAddress: (address: Address) => void;
    _job: Promise<unknown>;
    _lastAddress: string;
    _pending: Set<EventEmitter>;
    subdomain: string;
    _fetch?: typeof global.fetch;
    _hostname = '';

    constructor(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        { id = 50, host = 'localhost', port = 3000, namespace = 'client' },
        onAddress = (_address: Address) => {
            /* empty */
        }
    ) {
        this._host = `${host}:${port}`;
        this._port = port;
        this._clientManager = new ClientManager({ host, port });
        this.onAddress = onAddress;
        this._job = Promise.resolve();
        this._lastAddress = host;
        this._pending = new Set();
        this.subdomain = 'pleroma'; //TODO make configurable
    }

    async init() {
        await this._clientManager.init();
    }

    async patchFetch() {
        this._fetch = global.fetch;
        global.fetch = this.pocketFetch.bind(this);
    }

    handleAddresses({ lan, wan }: Address) {
        this._clientManager.addAddress(lan);
        this._clientManager.addAddress(wan);
        setTimeout(() => this.onAddress({ lan, wan }), 0);
    }

    patchFetchArgs(_reqObj: URL | RequestInfo, _reqInit?: RequestInit) {
        const reqInit = _reqInit || {};
        if (typeof _reqObj === 'string') {
            let reqObj;
            if (_reqObj.startsWith('http')) {
                const url = new URL(_reqObj);
                if (url.host === getHost()) {
                    console.log('subdomain', _reqInit);
                    url.host = 'localhost';
                    url.protocol = 'http:';
                    url.port = '80';
                }
                reqObj = url.toString();
            } else {
                reqObj = `http://localhost${reqObj}`;
            }
            reqInit.headers = reqInit.headers || {};
            if (typeof reqInit.headers.entries == 'function') {
                for (const pair of reqInit.headers.entries()) {
                    (reqInit.headers as Headers).set(
                        pair[0] as string,
                        pair[1] as string
                    );
                    console.log(pair[0] + ': ' + pair[1]);
                }
            }

            (reqInit.headers as Headers).set(
                'X-Intercepted-Subdomain',
                this.subdomain
            );
            return { reqObj, reqInit };
        }
        const req = _reqObj as Request;
        // if (typeof _reqObj === "string" && _reqObj.startsWith("http")) {
        // console.log("patch");
        const url = new URL(
            req.url.startsWith('http') ? req.url : `http://localhost${req.url}`
        );
        reqInit.headers = req.headers || {};
        if (url.pathname !== '/manifest.json') {
            reqInit.headers.set('X-Intercepted-Subdomain', this.subdomain);
        }

        for (const pair of req.headers.entries()) {
            reqInit.headers.set(pair[0], pair[1]);
            // console.log(pair[0] + ": " + pair[1]);
        }

        if (url.host === getHost()) {
            // console.log("subdomain", _reqInit);
            url.host = 'localhost';
            url.protocol = 'http:';
            url.port = '80';
        }

        // }

        const reqObj = {
            ...req,
            url: url.toString(),
        };

        return { reqObj, reqInit: _reqInit };
    }

    abort() {
        Array.from(this._pending).forEach(e => {
            e.emit('abort', new Error('aborted'));
            this._pending.delete(e);
        });
    }

    async pocketFetch(
        reqObj: URL | RequestInfo,
        reqInit: RequestInit | undefined = {},
        xhr?: XMLHttpRequest
    ): Promise<Response> {
        // if (reqObj.indexOf(".wasm") > 0) {
        //   return this._fetch(reqObj, reqInit);
        // }
        // alert("alert " + reqObj);
        // this._job = this._job.then(async () => {
        // console.log("pocketFetch", xhr, reqObj, reqInit);
        const patched = this.patchFetchArgs(reqObj, reqInit);
        const body = (reqObj as Request).body
            ? (reqObj as Request).body
            : reqInit.body
            ? reqInit.body
            : (reqObj as Request).arrayBuffer
            ? await (reqObj as Request).arrayBuffer()
            : null;

        reqObj = patched.reqObj;
        reqInit = patched.reqInit;
        // console.log("pocketFetch2", reqObj, reqInit, body);
        //delete (reqObj as Request).body;
        delete reqInit?.body;
        const pbody = await normalizeBody(body);
        const packet = encode({ reqObj, reqInit }, pbody);
        // alert("get client");
        console.log('encodedPacket');
        // alert(`fetching ${reqObj}`);
        const client = await this._clientManager.getClient();
        // alert(`fetching from ${client.address}`);
        // console.log("pocketfetch3", client);
        const uuid = randomRoute(); //Math.random().toString(36).slice(2).slice(0, 6); // short lived id, don't need hard unique constraints
        let i = 0;
        for (; i < Math.floor(packet.length / CHUNK_SIZE); i++) {
            client.send(
                uuid,
                packet.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
            );
        }

        // alert(uuid);
        // alert("last chunk " + i);
        const sendResult = client.send(
            uuid,
            packet.slice(i * CHUNK_SIZE),
            xhr?.timeout || 60000,
            true
        );
        // await once(eventEmitter.eventEmitter, "reply");
        // alert("chunk reply");
        // console.log("uuid?", uuid);
        // let eventEmitter = client.send(uuid, packet, xhr.timeout || 60000, true);
        // console.log("pocketFetch4", eventEmitter, eventEmitter.msgId);

        if (sendResult && sendResult.eventEmitter) {
            const { eventEmitter } = sendResult;

            return Promise.race([
                new Promise<Response>((resolve, reject) => {
                    eventEmitter.on('error', reject);
                    eventEmitter.on('abort', () => {
                        // alert("abort");
                        resolve(
                            new Response(undefined, {
                                ok: false,
                            } as ResponseInit)
                        );
                    });
                }),
                (async (): Promise<Response> => {
                    this._pending.add(eventEmitter);
                    const chunks = [];
                    let clen = 0;
                    do {
                        const chunk = await once(eventEmitter, 'reply');
                        // console.log("chunk", uuid, chunk);
                        chunks.push(Buffer.from(chunk.data));
                        clen = chunk.data.length;
                    } while (clen > 0);
                    // console.log("concat reply", chunks);
                    const reply = Buffer.concat(chunks);
                    this._lastAddress = client.address || '';
                    const resp = decode(reply);
                    const { lan, wan } = resp.json as Address;
                    this.handleAddresses({ lan, wan });
                    // console.log("resp.json", resp.body, resp.json.res);
                    (
                        resp.json as {
                            res: { headers: Headers };
                        }
                    ).res.headers = new Headers(
                        (
                            resp.json as {
                                res: { headers: Headers };
                            }
                        ).res.headers
                    );
                    // alert("complete");
                    this._pending.delete(eventEmitter);
                    return new Response(
                        resp.body as unknown as BodyInit,
                        resp.json['res'] as unknown as ResponseInit
                    );
                })(),
            ]);
        } else {
            return new Response(undefined, { ok: false } as ResponseInit);
        }
        // });

        // return this._job;
    }

    async patchFetchBrowser() {
        this._fetch = window.fetch.bind(window);
        this._host = `${window.location.hostname}:${this._port}`;
        this._hostname = window.location.hostname;
        window.fetch = this.pocketFetch.bind(this);

        this.patchXHR();
    }

    async patchFetchWorker() {
        this._fetch = self.fetch.bind(self);
        this._host = `${getHost()}:${this._port}`;
        this._hostname = getHost();
        self.fetch = this.pocketFetch.bind(this);
    }

    patchXHR() {
        const _send = XMLHttpRequest.prototype.send;
        const _open = XMLHttpRequest.prototype.open;
        const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (!this._headers) {
                Object.defineProperties(this, {
                    _headers: {
                        value: {},
                        writable: true,
                    },
                });
            }

            this._headers[name] = value;
            return _setRequestHeader.bind(this)(name, value);
        };
        XMLHttpRequest.prototype.open = function (method, url) {
            this._method = method;
            this._url = url;
            return _open.bind(this)(method, url);
        };

        XMLHttpRequest.prototype.send = async function (body) {
            try {
                console.log('xhr.send', this);
                const url = this._url;
                const method = this._method;
                const init = {
                    method,
                    headers: this._headers || {},
                    body: null as unknown,
                };
                if (body) init.body = body;
                const res = await (
                    fetch as (
                        input: URL | RequestInfo,
                        init?: RequestInit | undefined,
                        xhr?: XMLHttpRequest
                    ) => Promise<Response>
                )(url, init as RequestInit, this);
                console.log('got res', res);
                const text = await res.text();
                // console.log("");
                Object.defineProperties(this, {
                    status: {
                        get: () => res.status,
                    },
                    statusText: {
                        get: () => res.statusText,
                    },
                    response: {
                        get: () => text,
                    },
                    responseText: {
                        get: () => text,
                    },
                    readyState: {
                        get: () => XMLHttpRequest.DONE,
                    },
                    getResponseHeader: {
                        value: (key: string) => res.headers.get(key),
                    },
                    getAllResponseHeaders: {
                        value: () => {
                            const _res = [];
                            console.log('res.headers', res.headers);
                            for (const pair of res.headers.entries()) {
                                _res.push(`${pair[0]}: ${pair[1]}`);
                            }
                            return _res.join('\r\n');
                        },
                    },
                });
                console.log(
                    'xhr got res',
                    method,
                    url,
                    this.responseText,
                    this.readyState
                );
                this.dispatchEvent(new Event('load'));
                this.dispatchEvent(new Event('loadend'));
                this.dispatchEvent(new Event('readystatechange'));
            } catch (e) {
                console.log('xhr error', e);
                this.dispatchEvent(new Event('error' + e));
            }
        };
    }
}
