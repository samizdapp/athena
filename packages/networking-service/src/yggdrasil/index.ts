import { Socket } from 'node:net';
import { environment } from '../environments/environment';

class Deferred {
    promise: Promise<any>;
    resolve: any;
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
    key: string;
};

type getNodeInfoResponse = Record<any, any>;
type getPeersResponse = {
    key: string;
    port: number;
    coords: number[];
    remote: string;
}[];

type RPCResponseInternal = getNodeInfoResponse | getPeersResponse;

type RPCResponse = {
    request: RPCRequest;
    status: 'success' | 'error';
    response: RPCResponseInternal;
    error?: string;
};

class YggdrasilManager {
    private eventTarget = new EventTarget();
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

    private async rpc(json: RPCRequest): Promise<RPCResponse> { {
        const data = Buffer.from(JSON.stringify(json) + '\n');
        this.socket.write(data);
        this.inboxJSON = new Deferred();
        return this.inboxJSON.promise;
    }
}
