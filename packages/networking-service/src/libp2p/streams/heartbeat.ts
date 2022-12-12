import { Stream } from '@libp2p/interface-connection';
import { RawStream, Deferred } from './raw';

export enum HeartbeatType {
    SENDER = 'SENDER',
    RECEIVER = 'RECEIVER',
    DUPLEX = 'DUPLEX',
}
export class HeartbeatStream extends RawStream {
    private closeDeferred = new Deferred<void>();

    private initializers = {
        [HeartbeatType.SENDER]: this.initSender.bind(this),
        [HeartbeatType.RECEIVER]: this.initReceiver.bind(this),
        [HeartbeatType.DUPLEX]: this.initDuplex.bind(this),
    };

    constructor(libp2pStream: Stream, private readonly type: HeartbeatType) {
        super(libp2pStream);
    }

    private async initSender() {
        while (this.isOpen) {
            await this.write(Buffer.from('deadbeef', 'hex'));
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    private async initReceiver() {
        let data = null,
            timeout;

        while (this.isOpen && (data = await this.read()) != null) {
            if (data.equals(Buffer.from('deadbeef', 'hex'))) {
                clearTimeout(timeout);
                timeout = setTimeout(this.handleTimeout.bind(this), 10000);
            }
        }
    }

    private async initDuplex() {
        return Promise.all([this.initSender(), this.initReceiver()]);
    }

    public async init() {
        await this.initializers[this.type]();
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
