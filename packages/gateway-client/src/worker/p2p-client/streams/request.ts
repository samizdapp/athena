import { RawStream } from './raw';
import { LobStream } from './lob';
import { Packet } from './lob-enc';

export class StreamPool {
    private static pool: Set<RawStream> = new Set();

    static getFromPool(
        protocol: string,
        Constructor: typeof RawStream
    ): RawStream | null {
        for (const potential of this.pool) {
            if (!potential.isOpen) {
                this.pool.delete(potential);
                continue;
            }

            if (
                potential.protocol === protocol &&
                potential.constructor === Constructor
            ) {
                this.pool.delete(potential);
                return potential;
            }
        }

        return null;
    }

    static release(stream: RawStream) {
        StreamPool.pool.add(stream);
    }
}

export class RequestStream extends LobStream {
    public async request(
        packet: Packet,
        onChunk?: EventListenerOrEventListenerObject
    ): Promise<Packet | null> {
        if (onChunk) {
            this.eventTarget.addEventListener('chunk', onChunk);
        }
        this.send(packet);
        const response = await this.receive();
        if (onChunk) {
            this.eventTarget.removeEventListener('chunk', onChunk);
        }

        return response;
    }

    release() {
        StreamPool.release(this as unknown as RawStream);
    }
}
