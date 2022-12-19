import localforage from 'localforage';

import { WorkerVersionManifest } from '../../worker-messaging';
import * as logging from '../logging';
import { P2pClient } from '../p2p-client';
import status from '../status';
import { getVersion } from '../version';

declare const self: {
    SamizdAppDevTools: SamizdAppDevTools;
    version: WorkerVersionManifest;
} & ServiceWorkerGlobalScope;

export class SamizdAppDevTools {
    public logging = logging;
    public status = status;
    public localforage = localforage;
    public version = getVersion();

    constructor(public p2pClient: P2pClient) {
        // attach to window
        self.SamizdAppDevTools = this;
    }

    public get addressBook() {
        return this.p2pClient.node?.peerStore
            .all()
            .then(peers =>
                Object.fromEntries(
                    peers.map(it => [
                        it.id.toString(),
                        it.addresses.map(it => it.multiaddr.toString()),
                    ])
                )
            );
    }
}
