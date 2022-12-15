import node from '../node';
import { RawStream } from './raw';
import relays from '../relays';
import { Debug } from '../../logging';

export class RelayStream extends RawStream {
    protected override readonly log = new Debug('libp2p-relay-stream');

    public async init() {
        relays.on('activate', this.handleRelayActivate.bind(this));
        this.writeInitialRelays();
    }

    private async handleRelayActivate(relayAddr: string) {
        await this.writeRelay(relayAddr);
    }

    private async writeSelfRelay() {
        const selfMa = await node.getPublicMultiaddr();
        if (!selfMa) return;
        await this.writeRelay(selfMa);
    }

    private async writeInitialRelays() {
        this.log.debug('write initial relays', this.peer);
        await this.writeSelfRelay();
        for (const relayAddr of await relays.getRelays()) {
            await this.writeRelay(relayAddr);
        }
    }

    private async writeRelay(relayAddr: string) {
        this.log.trace('write relay', relayAddr, this.peer);
        await this.write(Buffer.from(relayAddr));
    }
}
