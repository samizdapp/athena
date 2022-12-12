import node from '../node';
import { RawStream } from './raw';
import relays from '../relays';

export class RelayStream extends RawStream {
    public async init() {
        relays.on('activate', this.handleRelayActivate.bind(this));
        this.writeInitialRelays();
    }

    private async handleRelayActivate(relayAddr: string) {
        await this.writeRelay(relayAddr);
    }

    private async writeSelfRelay() {
        const selfMa = await node.getSelfMultiaddr();
        if (!selfMa) return;
        await this.writeRelay(selfMa);
    }

    private async writeInitialRelays() {
        await this.writeSelfRelay();
        for (const relayAddr of await relays.getRelays()) {
            await this.writeRelay(relayAddr);
        }
    }

    private async writeRelay(relayAddr: string) {
        await this.write(Buffer.from(relayAddr));
    }
}
