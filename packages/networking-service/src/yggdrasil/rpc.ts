import { Socket } from 'node:net';
import config from './config';
import { environment } from '../environments/environment';

//eslint-disable-next-line @typescript-eslint/no-explicit-any
class Deferred {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    promise: Promise<any>;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: any;
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject: any;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}


const waitFor = (ms: number) => new Promise(resolve => setTimeout(() => resolve(null), ms));

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

export type getNodeInfoResponse = Record<string, {
        samizdapp?: {
            groups: string[];
        };
    } & Record<string, string>>

export type NodeInfo = {
    address: string,
    samizdapp?: {
        groups: string[],
    }
}

type getPeersResponse = string[];

type rawGetPeersResponse = Record<string, {
    keys: string[];
}>

type RawGetSelfResponse = {
    self: Record<string, {
        coords: number[];
        port: number;
        key: string;
    }>
};

type getSelfResponse = {
    key: string;
}

type RPCResponseInternal =
    & getNodeInfoResponse
    & rawGetPeersResponse
    & RawGetSelfResponse;

type RPCResponse = {
    request: RPCRequest;
    status: 'success' | 'error';
    response: RPCResponseInternal;
    error?: string;
};

class RPCWorker {
    static readonly poolSize = 10
    static readonly available = new Set()
    static readonly in_use = new Set()
    static errorCount = 0
    private socket = new Socket();
    private inboxBuffer = Buffer.alloc(0);
    private inboxJSON = new Deferred();
    private _locked = true

    constructor() {
        this.initialize()
    }

    static async error(){
        this.errorCount++
        if (this.errorCount > 2 * this.poolSize){
            // 20 seconds of errors, trigger manual restart of yggdrasil
            config.save(true)
        }
        await waitFor(20000 * this.poolSize)
        this.errorCount--
    }

    initialize() {
        // console.info('initializing yggdrasil rpc', environment.yggdrasil_admin_host, environment.yggdrasil_admin_port)
        const socket = this.socket;
        let closed = false;
        this.socket.on('data', data => {
            this.receive(data);
        });
        this.socket.on('error', error => {
            console.warn(error);
            if (this.socket === socket) {
                setTimeout(() => {
                    if (!closed){
                        // error before connected, so no close event
                        this.recover('socket error')
                    }
                },100)
            }

            RPCWorker.error()
        });
        this.socket.on('connect', () => {
            // console.log('connected to yggdrasil rpc')
            this.unlock()
        })
        this.socket.on('close', () => {
            if (this.socket === socket){
                // console.log('yggdrasil rpc closed')
                closed = true;
                this.recover('socket closed')
            }
        })
        this.socket.connect(
            environment.yggdrasil_admin_port,
            environment.yggdrasil_admin_host
        );
    }

    async recover(msg: string) {
        console.warn(msg)
        this.lock()
        await waitFor(10000)
        this.socket = new Socket();
        this.inboxBuffer = Buffer.alloc(0);
        this.inboxJSON = new Deferred();
        this.initialize()
    }

    private receive(data: Buffer) {
        this.inboxBuffer = Buffer.concat([this.inboxBuffer, data]);
        try {
            const json = JSON.parse(this.inboxBuffer.toString().trim());
            this.inboxBuffer = Buffer.alloc(0);
            this.inboxJSON.resolve(json);
        } catch (e) {
            //console.log('not a complete json yet', this.inboxBuffer.toString());
        }
    }

    
    static async getFromPool(){
        while (true){
            if (RPCWorker.available.size > 0){
                const worker = RPCWorker.available.values().next().value
                RPCWorker.available.delete(worker)
                RPCWorker.in_use.add(worker)
                // console.log('got worker from pool', RPCWorker.in_use.size, RPCWorker.available.size)
                return worker
            }
            if (RPCWorker.in_use.size < RPCWorker.poolSize){
                const worker = new RPCWorker()
                RPCWorker.in_use.add(worker)
                // console.log('created worker', RPCWorker.in_use.size, RPCWorker.available.size)
                return worker
            }
            await waitFor(100)
        }
    }

    release(){
        // console.log('releasing worker', RPCWorker.in_use.size, RPCWorker.available.size)
        RPCWorker.in_use.delete(this)
        RPCWorker.available.add(this)
    }

    private async ready(){
        while (this._locked){
            await waitFor(100)
        }
    }

    private async lock(){
        this._locked = true
    }

    private unlock(){
        this._locked = false
    }

    async rpc(json: RPCRequest): Promise<RPCResponse> {
        await this.ready()
        // console.log('rpc', json)
        const data = Buffer.from(JSON.stringify(json) + '\n');
        this.inboxJSON = new Deferred();
        // console.log('rpc', json)
        this.socket.write(data);
        const response = await Promise.race([this.inboxJSON.promise, waitFor(10000)])
        // console.log('response', response)
        return response
    }
}

export class YggdrasilRPC {
    private async rpc(json: RPCRequest): Promise<RPCResponse| null> {
        const worker = await RPCWorker.getFromPool()
        const response = await worker.rpc(json)
        await worker.release()
        return response
    }

    private transformRawNodeInfo(rawNodeInfo: getNodeInfoResponse): NodeInfo{
        const address = Object.keys(rawNodeInfo)[0]
        const nodeInfo = {
            ...rawNodeInfo[address],
            address
        }
        return nodeInfo
    }

    async getNodeInfo(key: string): Promise<NodeInfo| null> {
        const response = await this.rpc({
            request: RPCRequestType.getNodeInfo,
            keepalive: true,
            key,
        });
        if (!response) return null
        return this.transformRawNodeInfo(response.response as getNodeInfoResponse);
    }

    private transformRawSelf(rawSelf: RawGetSelfResponse): getSelfResponse{
        const addr = Object.keys(rawSelf.self)[0]
        return {
            key: rawSelf.self[addr].key
        }
    }

    async getSelf(): Promise<getSelfResponse| null> {
        const response = await this.rpc({
            request: RPCRequestType.getSelf,
            keepalive: true,
        });
        if (!response) return null
        return this.transformRawSelf(response.response) as getSelfResponse;
    }

    private transformRawGetPeers(rawPeers: rawGetPeersResponse): getPeersResponse{
        const peers = Object.keys(rawPeers).map(key => rawPeers[key].keys).flat()
        return peers
    }

    async getPeers(): Promise<getPeersResponse> {
        const response = await this.rpc({
            request: RPCRequestType.getPeers,
            keepalive: true,
        });
        if (!response) return []

        return this.transformRawGetPeers(response.response) ;
    }

    async debug_remoteGetSelf(key: string): Promise<getSelfResponse| null> {
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetSelf,
            keepalive: true,
            key,
        });
        if (!response) return null
        return this.transformRawSelf(response.response) ;
    }

    async debug_remoteGetPeers(key: string): Promise<getPeersResponse> {
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetPeers,
            keepalive: true,
            key,
        });
        if (!response) return []
        return this.transformRawGetPeers(response.response);
    }
}


export default new YggdrasilRPC()