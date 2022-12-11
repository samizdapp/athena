import nodePromise from './node';
import { Libp2p } from '@athena/shared/libp2p';
import { writeFile } from 'fs/promises';
import { environment } from '../environments/environment';
import upnp from '../upnp';

class Libp2pManager {
    private node?: Libp2p;
    constructor() {
        nodePromise.then(node => {
            this.node = node;
            this.writeLibp2pFiles();
        });
    }

    private async writeLibp2pFiles() {
        await upnp.resolved;
        return Promise.all([
            this.writeLibp2pBootstrapFile(),
            this.writeLibp2pRelayFile(),
        ]);
    }

    private async writeLibp2pBootstrapFile() {
        const ma = await this.getLocalMultiaddr();
        await writeFile(environment.libp2p_bootstrap_file, ma, {
            encoding: 'utf8',
        });
    }

    private async getLocalMultiaddr() {
        const localIP = await upnp.getLocalIP();
        const privatePort = upnp.info.libp2p.internalPort;
        return `/ip4/${localIP}/tcp/${privatePort}/ws/p2p/${this.node?.peerId.toString()}`;
    }

    private async writeLibp2pRelayFile() {
        const ma = await this.getRelayMultiaddr();
        if (!ma) return;
        await writeFile(environment.libp2p_relay_file, ma, {
            encoding: 'utf8',
        });
    }

    private async getRelayMultiaddr() {
        const publicIP = upnp.info.libp2p.publicHost;
        const publicPort = upnp.info.libp2p.publicPort;
        if (publicIP && publicPort) {
            return `/ip4/${publicIP}/tcp/${publicPort}/ws/p2p/${this.node?.peerId.toString()}`;
        }
        return null;
    }
}

export default new Libp2pManager();
