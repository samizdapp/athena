import { RawStream, Deferred } from './raw';
import { Packet, decode } from './lob/lob-enc';
import { Stream } from '@libp2p/interface-connection';
import { Debug } from '../../logging';
export class LobStream extends RawStream {
    protected override readonly log = new Debug('libp2p-lob-stream');
    private chunkSize = 64 * 1024;
    private outbox = new Deferred<Packet>();
    private inbox = new Deferred<Packet | null>();
    public hasInitialized = false;

    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.initOutbox();
        this.initInbox().then(() => {
            console.debug('stream is closed');
        });
    }

    private packetToChunks(packet: Packet | Buffer) {
        const chunks: Buffer[] = [];
        for (let i = 0; i <= Math.floor(packet.length / this.chunkSize); i++) {
            chunks.push(
                packet.subarray(i * this.chunkSize, (i + 1) * this.chunkSize)
            );
        }
        return chunks;
    }

    private async initOutbox() {
        let packet = null;
        while (this.isOpen && (packet = await this.outbox.promise) != null) {
            for (const chunk of this.packetToChunks(packet)) {
                await this.write(chunk);
            }
        }
        this.log.debug('outbox done');
    }

    private async initInbox() {
        let chunk = null,
            chunks = [],
            currentLength = 0,
            headLength = 0,
            totalLength = 0;

        while (this.isOpen && (chunk = await this.read()) !== null) {
            this.log.trace('inbox', chunk);
            chunks.push(chunk);

            // first 2 bytes of the first chunk are the length of the packet json portion
            if (headLength === 0) {
                headLength = chunk.readUInt16BE(0) + 2;
                this.log.trace('headLength', headLength);
            }

            // add the length of the current chunk to the total length
            currentLength += chunk.length;

            // if we haven't read the packet json yet, we don't know the
            // total length of the packet, so we can't know when we're done
            let packet = null;
            if (totalLength === 0 && currentLength >= headLength) {
                packet = decode(Buffer.concat(chunks));
                totalLength =
                    ((packet?.json?.bodyLength as number) ?? 0) + headLength;
                this.log.trace('totalLength', totalLength);
            }

            // if we've read the packet json and we've got the total length
            // of the packet, we can resolve the inbox
            if (currentLength === totalLength) {
                // ensure we have the packet
                packet = packet || decode(Buffer.concat(chunks));
                // reset our local state
                currentLength = headLength = totalLength = 0;
                chunks = [];
                // resolve the inbox
                this.log.debug('inbox resolved', packet);
                this._receive(packet as Packet);
            }

            this.eventTarget.emit('chunk', { detail: chunk });
        }

        this.log.debug('stream stopped receiving data');
    }

    protected send(packet: Packet): void {
        this.outbox.resolve(packet);
        this.outbox = new Deferred<Packet>();
    }

    protected receive(): Promise<Packet | null> {
        return this.inbox.promise;
    }

    private async _receive(packet: Packet | null): Promise<void> {
        this.inbox.resolve(packet);
        this.inbox = new Deferred<Packet | null>();
    }
}
