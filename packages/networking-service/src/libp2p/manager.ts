import node from './node';
import { writeFile } from 'fs/promises';
import { environment } from '../environments/environment';
import upnp from '../upnp';

class Libp2pManager {
    constructor() {
        this.writeLibp2pFiles();
    }

    private async writeLibp2pFiles() {
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
        const upnpInfo = await upnp.info();
        const privatePort = upnpInfo.libp2p.internalPort;
        const selfPeerString = await node.getSelfPeerString();
        return `/ip4/${localIP}/tcp/${privatePort}/ws/p2p/${selfPeerString}`;
    }

    private async writeLibp2pRelayFile() {
        const ma = await this.getRelayMultiaddr();
        if (!ma) return;
        await writeFile(environment.libp2p_relay_file, ma, {
            encoding: 'utf8',
        });
    }

    private async getRelayMultiaddr() {
        const upnpInfo = await upnp.info();
        const publicIP = upnpInfo.libp2p.publicHost;
        const publicPort = upnpInfo.libp2p.publicPort;
        const selfPeerString = await node.getSelfPeerString();
        if (publicIP && publicPort) {
            return `/ip4/${publicIP}/tcp/${publicPort}/ws/p2p/${selfPeerString}`;
        }
        return null;
    }
}

export default new Libp2pManager();
