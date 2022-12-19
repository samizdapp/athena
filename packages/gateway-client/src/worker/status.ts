import {
    ClientMessageType,
    ServerPeerStatus,
    WorkerMessageType,
} from '../worker-messaging';
import messenger from './messenger';
import { setVersionUpdateAvailable } from './update-app';
import { getVersion } from './version';

class Status {
    _serverPeer: ServerPeerStatus | null = null;
    relays: string[] = [];

    constructor() {
        messenger.addListener(ClientMessageType.REQUEST_STATUS, () => {
            this.sendCurrent();
        });

        Reflect.defineProperty(this.relays, 'push', {
            value: (...items: string[]): number => {
                const ret = Array.prototype.push.call(this.relays, ...items);
                messenger.postMessage({
                    type: WorkerMessageType.LOADED_RELAYS,
                    relays: this.relays,
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
        messenger.postMessage({
            type: WorkerMessageType.SERVER_PEER_STATUS,
            status,
        });
    }

    async sendVersion() {
        // set the update available flags on our version info first
        await setVersionUpdateAvailable();
        // now, send status
        messenger.postMessage({
            type: WorkerMessageType.VERSION,
            version: getVersion(),
        });
    }

    async sendCurrent() {
        await this.sendVersion();
        messenger.postMessage({
            type: WorkerMessageType.LOADED_RELAYS,
            relays: this.relays,
        });
        messenger.postMessage({
            type: WorkerMessageType.SERVER_PEER_STATUS,
            status: this.serverPeer,
        });
    }
}

export default new Status();
