import { Deferred, RawStream } from './raw';
import { Stream } from '@libp2p/interface-connection';
import transformers from '../../transformers';
import { StreamPool } from './request';

export class NativeRequestStream extends RawStream {
    private chunkSize = 64 * 1024;
    private outbox = new Deferred<Request>();
    private inbox = new Deferred<Response>();
    private done = new Deferred<null>();
    private responseHeadBuffer = Buffer.alloc(0);
    private responseHead: ResponseInit | null = null;
    private response: Response | null = null;
    private responseBodyStream: ReadableStream | null = null;
    private responseBodyController: ReadableStreamDefaultController | null =
        null;

    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.initOutbox();
        this.initInbox().then(() => {
            this.log.debug('stream is closed');
        });
    }

    async fetch(request: Request) {
        const transformedRequest = transformers.transformRequest(request);
        this.outbox.resolve(transformedRequest);
        const response = await this.inbox.promise;
        const transformedResponse = transformers.transformResponse(response);
        return transformedResponse;
    }

    private getRequestHead(request: Request) {
        return {
            method: request.method,
            url: request.url,
            headers: Array.from(request.headers.entries()),
        };
    }

    private encodeHead(pojo: Record<string, string | [string, string][]>) {
        const string = JSON.stringify(pojo);
        const buffer = Buffer.from('\0\0' + string);
        buffer.writeUint16BE(buffer.byteLength);
        return buffer;
    }

    private chunkify(chunkType: number, buffer: Buffer) {
        const chunks = [];
        for (let i = 0; i < buffer.byteLength; i += this.chunkSize) {
            const chunk = Buffer.alloc(this.chunkSize + 1);
            chunk.writeUInt8(chunkType, 0);
            buffer.copy(chunk, 1, i, i + this.chunkSize);
            chunks.push(chunk);
        }
        return chunks;
    }

    private async writeRequestHead(request: Request) {
        const requestHeadPojo = this.getRequestHead(request);
        const requestHeadBuffer = this.encodeHead(requestHeadPojo);
        const requestHeadChunks = this.chunkify(0x00, requestHeadBuffer);
        for (const chunk of requestHeadChunks) {
            await this.write(chunk);
        }
    }

    private async writeRequestBody(request: Request) {
        if (request.body instanceof ArrayBuffer) return;
        if (!request.body) return;
        const rawChunks = this.readableStreamToAsyncIterator(request.body);

        for await (const chunk of rawChunks) {
            const chunks = this.chunkify(0x01, chunk);
            for (const chunk of chunks) {
                await this.write(chunk);
            }
        }
    }

    private async *readableStreamToAsyncIterator(stream: ReadableStream) {
        const reader = stream.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    return;
                }
                yield value;
            }
        } finally {
            reader.releaseLock();
        }
    }

    private async initOutbox() {
        let request = null;
        while (this.isOpen && (request = await this.outbox.promise) != null) {
            await this.writeRequestHead(request);
            await this.writeRequestBody(request);
            await this.write(Buffer.from([0x02]));
        }
        this.log.debug('outbox done');
    }

    private async initInbox() {
        let chunk = null;
        while (this.isOpen && (chunk = await this.read()) != null) {
            this.receiveChunk(chunk);
        }
        this.log.debug('inbox done');
    }

    private receiveChunk(chunk: Buffer) {
        const type = chunk.readUInt8(0);
        const data = chunk.subarray(1);
        switch (type) {
            case 0x00:
                this.log.trace('receiveChunk', 'responseHead');
                this.receiveResponseHead(data);
                break;
            case 0x01:
                this.log.trace('receiveChunk', 'responseBody');
                this.receiveResponseBody(data);
                break;
            case 0x02:
                this.log.trace('receiveChunk', 'responseEnd');
                this.receiveResponseEnd();
                break;
            default:
                this.log.warn('receiveChunk', 'unknown chunk type', type);
        }
    }

    private receiveResponseHead(chunk: Buffer) {
        this.responseHeadBuffer = Buffer.concat([
            this.responseHeadBuffer,
            chunk,
        ]);
        if (this.responseHeadBuffer.byteLength < 2) return;
        const length = this.responseHeadBuffer.readUInt16BE(0);
        if (this.responseHeadBuffer.byteLength < length) return;
        const head = this.responseHeadBuffer.subarray(2, length);
        this.responseHead = JSON.parse(head.toString());
        this.responseHeadBuffer = Buffer.alloc(0);
        this.responseBodyStream = new ReadableStream({
            start: controller => {
                this.responseBodyController = controller;
            },
        });
        this.response = new Response(
            this.responseBodyStream,
            this.responseHead as unknown as ResponseInit
        );
        this.inbox.resolve(this.response);
    }

    private receiveResponseBody(chunk: Buffer): Response {
        if (!this.responseBodyController) {
            throw new Error('responseBodyController is null');
        }
        this.responseBodyController.enqueue(chunk);
        return this.response as Response;
    }

    private receiveResponseEnd() {
        if (!this.responseBodyController) {
            throw new Error('responseBodyController is null');
        }
        this.responseBodyController.close();
        this.done.resolve(null);
    }

    public async release() {
        await this.done.promise;
        StreamPool.release(this as unknown as RawStream);
    }
}
