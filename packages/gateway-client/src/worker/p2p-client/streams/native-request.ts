import { Deferred, RawStream } from './raw';
import { Stream } from '@libp2p/interface-connection';
import transformers from '../../transformers';
import { StreamPool } from './request';
import { logger } from '../../logging';

enum ChunkType {
    HEAD = 0x00,
    BODY = 0x01,
    END = 0x02,
    ABORT_SIGNAL = 0x03,
}

export class NativeRequestStream extends RawStream {
    static readonly log = logger.getLogger('worker/p2p/streams/native-request');
    protected override readonly log = NativeRequestStream.log;
    private chunkSize = 60 * 1024;
    private outbox = new Deferred<Request>();
    private inbox = new Deferred<Response>();
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
        const randomUUID = Math.random().toString(36).substring(2, 15);
        this.log.info('request', randomUUID, request.url, request);
        this.handleAbortSignal(request.signal);
        const transformedRequest = transformers.transformRequest(request);
        this.log.debug(
            'transformedRequest',
            transformedRequest.url,
            transformedRequest
        );
        const outbox = this.outbox;
        this.outbox = new Deferred<Request>();
        outbox.resolve(transformedRequest);
        const response = await this.inbox.promise;
        this.log.info('response', randomUUID, request.url, response);
        const transformedResponse = transformers.transformResponse(response);
        return transformedResponse;
    }

    private handleAbortSignal(signal: AbortSignal | null) {
        if (!signal) return;
        signal.addEventListener('abort', () => {
            this.log.debug('abort signal received');
            this.abort();
        });
    }

    private async abort() {
        this.log.debug('abort');
        await this.write(Buffer.from([ChunkType.ABORT_SIGNAL]));
        this.log.debug('abort ack received, release stream');
        this.release();
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
        const requestHeadChunks = this.chunkify(
            ChunkType.HEAD,
            requestHeadBuffer
        );
        for (const chunk of requestHeadChunks) {
            await this.write(chunk);
        }
    }

    private async writeRequestBody(request: Request) {
        if (request.body instanceof ArrayBuffer) return;
        if (!request.body) return;
        await this.writeRequestBodyStream(request.body);
    }

    private async writeRequestBodyStream(stream: ReadableStream) {
        const reader = stream.getReader();
        await this.write(Buffer.from([ChunkType.BODY]));
        let finished = false;
        do {
            const { value, done } = await reader.read();
            if (done) {
                finished = true;
            } else {
                // always wait for 1ms to avoid blocking the event loop
                let i = 0;
                while (i < value.byteLength) {
                    const chunk = value.slice(i, i + this.chunkSize);
                    await this.write(chunk);
                    i += this.chunkSize;
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        } while (!finished);

        reader.releaseLock();
    }

    private async initOutbox() {
        let request = null;
        while (this.isOpen && (request = await this.outbox.promise) != null) {
            await this.writeRequestHead(request);
            await this.writeRequestBody(request);
            await this.write(Buffer.from([ChunkType.END]));
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
            case ChunkType.HEAD:
                this.log.trace('receiveChunk', 'responseHead');
                this.receiveResponseHead(data);
                break;
            case ChunkType.BODY:
                this.log.trace('receiveChunk', 'responseBody');
                this.receiveResponseBody(data);
                break;
            case ChunkType.END:
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
        try {
            this.responseBodyController.enqueue(chunk);
        } catch (e) {
            this.log.error('receiveResponseBody', e);
        }
        return this.response as Response;
    }

    private receiveResponseEnd() {
        this.log.debug('receiveResponseEnd');
        this.release();
    }

    private release() {
        this.log.debug('release');
        this.responseHeadBuffer = Buffer.alloc(0);
        this.responseHead = null;
        this.response = null;
        this.responseBodyStream = null;
        this.responseBodyController?.close();
        this.responseBodyController = null;

        StreamPool.release(this as unknown as RawStream);
    }
}
