import node from './node';
import { writeFile } from 'fs/promises';
import { environment } from '../environments/environment';
import { Debug } from '../logging';

class Libp2pManager {
    private readonly log = new Debug('libp2p-manager');

    constructor() {
        this.writeLibp2pFiles()
            .then(() => {
                this.log.info('libp2p files written');
            })
            .catch(e => {
                this.log.error('libp2p files failed', e);
            });
    }

    private async writeLibp2pFiles() {
        return Promise.all([
            this.writeLibp2pBootstrapFile(),
            this.writeLibp2pRelayFile(),
        ]);
    }

    private async writeLibp2pBootstrapFile() {
        const ma = await node.getLocalMultiaddr();
        await writeFile(environment.libp2p_bootstrap_file, ma, {
            encoding: 'utf8',
        });
    }

    private async writeLibp2pRelayFile() {
        const ma = await node.getPublicMultiaddr();
        if (!ma) return;
        await writeFile(environment.libp2p_relay_file, ma, {
            encoding: 'utf8',
        });
    }
}

export default new Libp2pManager();
