import { Socket } from 'node:net';
import { environment } from '../environment';
import { Debug } from '../logging';
import { EventEmitter } from 'node:stream';

export class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

const waitFor = (ms: number) =>
    new Promise<void>(resolve => setTimeout(() => resolve(), ms));

enum RPCRequestType {
    getNodeInfo = 'getNodeInfo',
    getSelf = 'getSelf',
    getPeers = 'getPeers',
    debug_remoteGetSelf = 'debug_remoteGetSelf',
    debug_remoteGetPeers = 'debug_remoteGetPeers',
}

type RPCRequest = {
    request: RPCRequestType;
    keepalive: true;
    key?: string;
};

export type getNodeInfoResponse = Record<
    string,
    {
        samizdapp?: {
            groups: string[];
        };
    } & Record<string, string>
>;

export type NodeInfo = {
    address: string;
    samizdapp?: {
        groups: string[];
    };
};

type getPeersResponse = string[];

type rawGetPeersResponse = Record<
    string,
    {
        keys: string[];
    }
>;

type RawGetSelfResponse = {
    self: Record<
        string,
        {
            coords: number[];
            port: number;
            key: string;
        }
    >;
};

type getSelfResponse = {
    key: string;
};

type RPCResponseInternal = getNodeInfoResponse &
    rawGetPeersResponse &
    RawGetSelfResponse;

type RPCResponse = {
    request: RPCRequest;
    status: 'success' | 'error';
    response: RPCResponseInternal;
    error?: string;
};

export class RPCWorker extends EventEmitter {
    static readonly log = new Debug('yggdrasil-rpc-worker');
    static readonly poolSize = 10;
    static readonly defaultReadyTimeout = 10000;
    static readonly watchdogTimeout = 30000;
    static readonly available = new Set<RPCWorker>();
    static readonly in_use = new Set<RPCWorker>();
    static errorCount = 0;
    static lastWatchdog = 0;

    private readonly log = RPCWorker.log;
    private socket = new Socket();
    private inboxBuffer = Buffer.alloc(0);
    private inboxJSON = new Deferred<RPCResponse>();
    private _locked = true;

    constructor() {
        super();
        this.log.info('Initializing RPC connection...');
        this.initialize();
    }

    async watchdog() {
        this.emit('watchdog', 'yggdrasil rpc error');
    }

    initialize() {
        this.log.debug(
            'initializing yggdrasil rpc',
            environment.yggdrasil_admin_host,
            environment.yggdrasil_admin_port
        );
        const socket = this.socket;
        let closed = false;
        this.socket.on('data', data => {
            this.receive(data);
        });
        this.socket.on('error', error => {
            this.log[this._locked ? 'debug' : 'warn'](error.message);
            if (this.socket === socket) {
                this.log.trace('socket error', error.message);
                setTimeout(() => {
                    if (!closed) {
                        // error before connected, so no close event
                        this.recover('socket error: ' + error.message);
                    }
                }, 100);
            }

            this.watchdog();
        });
        this.socket.on('connect', () => {
            this.log.debug('connected to yggdrasil rpc socket');
            this.unlock();
        });
        this.socket.on('close', () => {
            if (this.socket === socket) {
                this.log.debug('socket closed');
                closed = true;
                this.recover('socket closed');
            }
        });

        this.log.trace(
            'connecting to yggdrasil rpc',
            environment.yggdrasil_admin_host,
            environment.yggdrasil_admin_port
        );
        this.socket.connect(
            environment.yggdrasil_admin_port,
            environment.yggdrasil_admin_host
        );
    }

    async recover(msg: string) {
        this.log[this._locked ? 'debug' : 'warn'](msg);
        this.lock();
        await waitFor(1000);
        this.socket = new Socket();
        this.inboxBuffer = Buffer.alloc(0);
        this.inboxJSON = new Deferred();
        this.initialize();
    }

    private receive(data: Buffer) {
        this.inboxBuffer = Buffer.concat([this.inboxBuffer, data]);
        try {
            const json = JSON.parse(this.inboxBuffer.toString().trim());
            this.inboxBuffer = Buffer.alloc(0);
            this.log.trace('received json', json);
            this.inboxJSON.resolve(json);
        } catch (e) {
            this.log.trace(
                'not a complete json yet',
                this.inboxBuffer.toString()
            );
        }
    }

    static async getFromPool() {
        while (true) {
            if (RPCWorker.available.size > 0) {
                const worker = RPCWorker.available.values().next()
                    .value as RPCWorker;
                RPCWorker.available.delete(worker);
                RPCWorker.in_use.add(worker);
                this.log.trace(
                    'got worker from pool',
                    RPCWorker.in_use.size,
                    RPCWorker.available.size
                );
                return worker;
            }
            if (RPCWorker.in_use.size < RPCWorker.poolSize) {
                const worker = new RPCWorker();
                RPCWorker.in_use.add(worker);
                this.log.trace(
                    'created worker',
                    RPCWorker.in_use.size,
                    RPCWorker.available.size
                );
                return worker;
            }
            await waitFor(100);
        }
    }

    release() {
        this.log.trace(
            'releasing worker',
            RPCWorker.in_use.size,
            RPCWorker.available.size
        );
        RPCWorker.in_use.delete(this);
        RPCWorker.available.add(this);
    }

    private async ready(timeout = RPCWorker.defaultReadyTimeout) {
        const start = Date.now();
        while (this._locked) {
            if (Date.now() - start > timeout) {
                this.log.error(
                    'RPC ready timeout reached - connection not ready.'
                );
                throw new Error(
                    'Timeout while waiting for RPC connection to be ready.'
                );
            }
            await waitFor(100);
        }
    }

    private async lock() {
        this.log.trace('locking worker');
        this._locked = true;
    }

    private unlock() {
        this.log.trace('unlocking worker');
        this._locked = false;
    }

    async rpc(json: RPCRequest) {
        this.log.trace('rpc await ready');
        try {
            await this.ready();
        } catch (e) {
            return null;
        }
        this.log.debug('rpc request (use trace to see content)', json.request);
        this.log.trace(JSON.stringify(json, null, 4));
        const data = Buffer.from(JSON.stringify(json) + '\n');
        this.inboxJSON = new Deferred();
        this.socket.write(data);
        this.log.trace('rpc sent');
        const response =
            (await Promise.race([this.inboxJSON.promise, waitFor(10000)])) ??
            null;
        this.log.debug(
            'rpc response (use trace to see content)',
            response?.status
        );
        this.log.trace('Response: ', response);
        return response;
    }
}

export class YggdrasilRPC {
    private readonly log = new Debug('yggdrasil-rpc');

    private async rpc(json: RPCRequest) {
        this.log.trace('rpc', json);
        const worker = await RPCWorker.getFromPool();
        this.log.trace('got worker from pool, call rpc method on worker');
        const response = await worker.rpc(json);
        this.log.trace('rpc method returned, releasing worker');
        await worker.release();
        this.log.trace('worker released');
        return response;
    }

    private transformRawNodeInfo(rawNodeInfo: getNodeInfoResponse): NodeInfo {
        this.log.trace('transforming raw node info', rawNodeInfo);
        const address = Object.keys(rawNodeInfo)[0];
        const nodeInfo = {
            ...rawNodeInfo[address],
            address,
        };
        this.log.trace('transformed raw node info', nodeInfo);
        return nodeInfo;
    }

    async getNodeInfo(key: string): Promise<NodeInfo | null> {
        this.log.debug('get node info', key);
        const response = await this.rpc({
            request: RPCRequestType.getNodeInfo,
            keepalive: true,
            key,
        });
        if (!response) return null;
        return this.transformRawNodeInfo(
            response.response as getNodeInfoResponse
        );
    }

    private transformRawSelf(rawSelf: RawGetSelfResponse): getSelfResponse {
        this.log.trace('transforming raw self', rawSelf);
        const addr = Object.keys(rawSelf.self)[0];
        const res = {
            key: rawSelf.self[addr].key,
        };
        this.log.trace('transformed raw self', res);
        return res;
    }

    async getSelf(): Promise<getSelfResponse | null> {
        this.log.debug('get self');
        const response = await this.rpc({
            request: RPCRequestType.getSelf,
            keepalive: true,
        });
        if (!response) return null;
        return this.transformRawSelf(response.response) as getSelfResponse;
    }

    private transformRawGetPeers(
        rawPeers: rawGetPeersResponse
    ): getPeersResponse {
        this.log.trace('transforming raw peers', rawPeers);
        const peers = Object.keys(rawPeers)
            .map(key => rawPeers[key].keys)
            .flat();
        this.log.trace('transformed raw peers', peers);
        return peers;
    }

    async getPeers(): Promise<getPeersResponse> {
        this.log.debug('get peers');
        const response = await this.rpc({
            request: RPCRequestType.getPeers,
            keepalive: true,
        });
        if (!response) return [];

        return this.transformRawGetPeers(response.response);
    }

    async debug_remoteGetSelf(key: string): Promise<getSelfResponse | null> {
        this.log.debug('debug remote get self', key);
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetSelf,
            keepalive: true,
            key,
        });
        if (!response) return null;
        return this.transformRawSelf(response.response);
    }

    async debug_remoteGetPeers(key: string): Promise<getPeersResponse> {
        this.log.debug('debug remote get peers', key);
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetPeers,
            keepalive: true,
            key,
        });
        if (!response) return [];
        return this.transformRawGetPeers(response.response);
    }
}

export default new YggdrasilRPC();
