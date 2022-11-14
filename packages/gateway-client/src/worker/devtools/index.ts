import { Libp2p } from 'libp2p';
import localforage from 'localforage';

import * as logging from '../logging';
import status from '../status';

declare const self: {
    SamizdAppDevTools: SamizdAppDevTools;
} & ServiceWorkerGlobalScope;

export class SamizdAppDevTools {
    public logging = logging;
    public status = status;
    public localforage = localforage;

    constructor(public libp2p: Libp2p) {
        // attach to window
        self.SamizdAppDevTools = this;
    }
}
