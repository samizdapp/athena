import { RawStream } from '../streams';
import { Stream } from '@libp2p/interface-connection';

export class HeartbeatStream extends RawStream {
    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.listen();
    }

    private async listen() {
        let data = null,
            timeout;
        while (this.isOpen && (data = await this.read()) != null) {
            this.log.trace('heartbeat', data);
            if (data.equals(Buffer.from('deadbeef', 'hex'))) {
                this.log.trace('heartbeat', 'received');
                clearTimeout(timeout);
                timeout = setTimeout(this.close.bind(this), 10000);
            }
        }
    }
}
