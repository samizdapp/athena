import { Socket } from 'node:net';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type getNodeInfoResponse = Record<any, any>;
type getPeersResponse = {
    key: string;
    port: number;
    coords: number[];
    remote: string;
}[];

type getSelfResponse = {
    key: string;
};

type RPCResponseInternal =
    | getNodeInfoResponse
    | getPeersResponse
    | getSelfResponse;

type RPCResponse = {
    request: RPCRequest;
    status: 'success' | 'error';
    response: RPCResponseInternal;
    error?: string;
};

export class YggdrasilRPC {
    private socket = new Socket();
    private inboxBuffer = Buffer.alloc(0);
    private inboxJSON = new Deferred();
    constructor() {
        this.socket.connect(
            environment.yggdrasil_admin_port,
            environment.yggdrasil_admin_host
        );
        this.socket.on('data', data => {
            this.receive(data);
        });
        this.socket.on('error', error => {
            console.log(error);
        });
    }

    private receive(data: Buffer) {
        this.inboxBuffer = Buffer.concat([this.inboxBuffer, data]);
        try {
            const json = JSON.parse(data.toString().trim());
            this.inboxBuffer = Buffer.alloc(0);
            this.inboxJSON.resolve(json);
        } catch (e) {
            // console.log('not a complete json yet');
        }
    }

    private async rpc(json: RPCRequest): Promise<RPCResponse> {
        const data = Buffer.from(JSON.stringify(json) + '\n');
        this.socket.write(data);
        this.inboxJSON = new Deferred();
        return this.inboxJSON.promise;
    }

    async getNodeInfo(key: string): Promise<getNodeInfoResponse> {
        const response = await this.rpc({
            request: RPCRequestType.getNodeInfo,
            keepalive: true,
            key,
        });
        return response.response as getNodeInfoResponse;
    }

    async getSelf(): Promise<getSelfResponse> {
        const response = await this.rpc({
            request: RPCRequestType.getSelf,
            keepalive: true,
        });
        return response.response as getSelfResponse;
    }

    async getPeers(): Promise<getPeersResponse> {
        const response = await this.rpc({
            request: RPCRequestType.getPeers,
            keepalive: true,
        });
        return response.response as getPeersResponse;
    }

    async debug_remoteGetSelf(key: string): Promise<getSelfResponse> {
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetSelf,
            keepalive: true,
            key,
        });
        return response.response as getSelfResponse;
    }

    async debug_remoteGetPeers(key: string): Promise<getPeersResponse> {
        const response = await this.rpc({
            request: RPCRequestType.debug_remoteGetPeers,
            keepalive: true,
            key,
        });
        return response.response as getPeersResponse;
    }
}
