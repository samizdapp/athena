import create from './create'
import { Libp2p } from 'libp2p'

class libp2p {
    private libp2p?: Libp2p;

    async start() {
        await create();
    }

    async stop() {
        await this.libp2p?.stop();
    }
}

export default new libp2p()