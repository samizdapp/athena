import { Stream } from '@libp2p/interface-connection';
import { EventEmitter } from 'node:stream';

import { Debug } from '../../logging';

export class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

export class RawStream {
    protected readonly log = new Debug('libp2p-raw-stream');

    protected eventTarget = new EventEmitter();
    private writeBuffer: Buffer[] = [];
    private writeDeferred = new Deferred<null>();
    private source: AsyncIterator<Buffer> | null = null;

    constructor(private readonly libp2pStream: Stream) {
        this.libp2pStream.sink(this.sink()).catch(e => {
            this.log.error('sink error', e);
            this.close();
        });
        this.source = this._source();
    }

    get peer(): string {
        return this.libp2pStream.metadata.peer;
    }

    get isOpen(): boolean {
        return this.libp2pStream.stat.timeline.close === undefined;
    }

    get protocol(): string | undefined {
        return this.libp2pStream.stat.protocol;
    }

    public async read(): Promise<Buffer | null> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return (await this.source!.next()).value || null;
    }

    public async write(data: Buffer): Promise<void> {
        return this._write(data);
    }

    private async *sink() {
        while (this.isOpen) {
            let next;
            while ((next = this.writeBuffer.shift())) {
                // console.log('sink', next);
                yield next;
            }
            await this.writeDeferred.promise;
            this.writeDeferred = new Deferred<null>();
        }
    }

    private _write(data: Buffer | null) {
        // console.log('_write', data);
        if (data) {
            this.writeBuffer.push(data);
        }
        this.writeDeferred.resolve(null);
    }

    private async *_source() {
        try {
            for await (const data of this.libp2pStream.source) {
                this.log.trace('source', data);
                yield Buffer.from(data.subarray());
            }

            this.log.debug('source', 'end');
        } catch (e) {
            this.log.warn('source error', e);
        } finally {
            this.close();
        }
    }

    public close() {
        this.log.info('close stream', this.protocol);
        this.libp2pStream.close();
        this.writeDeferred.resolve(null);
    }
}
