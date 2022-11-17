import localforage from 'localforage';

import * as logging from '../logging';
import { P2pClient } from '../p2p-client';
import status from '../status';

declare const self: {
    SamizdAppDevTools: SamizdAppDevTools;
} & ServiceWorkerGlobalScope;

export class SamizdAppDevTools {
    public logging = logging;
    public status = status;
    public localforage = localforage;

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
