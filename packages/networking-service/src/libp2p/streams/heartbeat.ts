import { Stream } from '@libp2p/interface-connection';
import { RawStream, Deferred } from './raw';

export class HeartbeatStream extends RawStream {
    private closeDeferred = new Deferred<void>();

    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.listen();
    }

    private async listen() {
        let data = null,
            timeout;
        while (this.isOpen && (data = await this.read()) != null) {
            if (data.equals(Buffer.from('deadbeef', 'hex'))) {
                clearTimeout(timeout);
                timeout = setTimeout(this.handleTimeout.bind(this), 10000);
            }
        }
    }

    private handleTimeout() {
        console.trace('heartbeat', 'timeout');
        this.close();
        this.closeDeferred.resolve();
    }

    public async waitForClose() {
        return this.closeDeferred.promise;
    }
}
