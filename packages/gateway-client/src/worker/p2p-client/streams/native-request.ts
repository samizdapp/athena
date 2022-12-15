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
    private responseHead: Response | null = null;
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
        ////console.log(
        //     'transformedRequest',
        //     Array.from(transformedRequest.headers.entries())
        // );
        const outbox = this.outbox;
        this.outbox = new Deferred<Request>();
        outbox.resolve(transformedRequest);
        const response = await this.inbox.promise;
        const transformedResponse = transformers.transformResponse(response);
        return transformedResponse;
    }

    private getRequestHead(request: Request) {
        ////console.log('getRequestHead', Array.from(request.headers.entries()));
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
            const chunk =
                i > 0
                    ? buffer.slice(i - 1, i + this.chunkSize)
                    : Buffer.alloc(
                          Math.min(buffer.byteLength - i, this.chunkSize) + 1
                      );
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
        const rawChunks = await this.readableStreamToChunks(request.body);

        for (const chunk of rawChunks) {
            const chunks = this.chunkify(0x01, chunk);
            for (const chunk of chunks) {
                await this.write(chunk);
            }
        }
    }

    private async readableStreamToChunks(body: ReadableStream) {
        const reader = (body as ReadableStream).getReader();
        // loop our reader and store the stream into a new buffer
        const chunks = [];
        let finished = false;
        let length = 0;
        do {
            const { done, value } = await reader.read();
            finished = done;
            if (!done) {
                const chunk = Buffer.from(value);
                length += chunk.byteLength;
                chunks.push(chunk);
            }
        } while (!finished);

        console.log('readableStreamToChunks', length);
        return chunks;
    }

    private async *readableStreamToAsyncIterator(stream: ReadableStream) {
        console.log('readableStreamToAsyncIterator', stream);
        const reader = stream.getReader();
        let length = 0;
        try {
            let finished = false;
            const chunks = [];
            do {
                const { value, done } = await reader.read();
                // ////console.log('readableStreamToAsyncIterator', value, done);
                if (done) {
                    finished = true;
                } else {
                    length += value.byteLength;
                    chunks.push(Buffer.from(value));
                }
            } while (!finished);
            console.log('readableStreamToAsyncIterator', 'done', length);

            for (const chunk of chunks) {
                yield chunk;
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
        this.response = this.makeResponse();

        this.log.debug('receiveResponseHead', this.responseHead, this.response);
        const inbox = this.inbox;
        this.inbox = new Deferred<Response>();
        inbox.resolve(this.response);
    }

    private makeResponse() {
        const headers = this.makeHeaders(
            (this.responseHead?.headers as unknown as [string, string][]) || []
        );
        const status = this.responseHead?.status;
        const statusText = this.responseHead?.statusText;
        const response = new Response(this.responseBodyStream, {
            status,
            statusText,
            headers,
        });

        const url = this.responseHead?.url;
        const redirected = this.responseHead?.redirected;
        const type = this.responseHead?.type;

        Object.defineProperties(response, {
            url: {
                get: () => url,
            },
            redirected: {
                get: () => redirected,
            },
            type: {
                get: () => type,
            },
        });

        return response;
    }

    private makeHeaders(headers: [string, string][]) {
        const result = new Headers();
        for (const [key, value] of headers) {
            result.append(key, value);
        }
        return result;
    }

    private receiveResponseBody(chunk: Buffer): Response {
        this.log.debug('receiveResponseBody', chunk);
        if (!this.responseBodyController) {
            throw new Error('responseBodyController is null');
        }
        this.responseBodyController.enqueue(chunk);
        return this.response as Response;
    }

    private receiveResponseEnd() {
        this.log.debug('receiveResponseEnd');
        if (!this.responseBodyController) {
            throw new Error('responseBodyController is null');
        }
        this.responseBodyController.close();
        this.release();
    }

    private async release() {
        StreamPool.release(this as unknown as RawStream);
    }
}
