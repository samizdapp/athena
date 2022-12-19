import { RawStream, Deferred } from './raw';
import type { Request, Response, RequestInfo } from 'node-fetch';
import fetchAgent from '../../fetch-agent';
import { Stream } from '@libp2p/interface-connection';
import { Readable } from 'stream';
import { Debug } from '../../logging';
import type { FetchError, RequestInit } from 'node-fetch';
import { AbortSignal } from 'node-fetch/externals';

enum ChunkType {
    HEAD = 0x00,
    BODY = 0x01,
    END = 0x02,
    ABORT = 0x03,
}

export class NativeRequestStream extends RawStream {
    static log = new Debug('native-request-stream');
    protected override readonly log = NativeRequestStream.log;
    private readonly chunkSize = 64 * 1024;
    private outbox = new Deferred<Response>();
    private inbox = new Deferred<Request>();
    private requestHeadBuffer = Buffer.alloc(0);
    private requestHead: Request | null = null;
    private request: Request | null = null;
    private requestBodyStream: Readable | null = null;
    private abortController: AbortController = new AbortController();

    constructor(libp2pStream: Stream) {
        super(libp2pStream);
    }

    async init() {
        this.initOutbox();
        this.initInbox().then(() => {
            this.log.debug('stream is closed');
        });
        this.initProxy();
    }

    private async fetch(request: Request, init: RequestInit = {}) {
        this.log.debug('fetch', request.url);
        return fetchAgent.fetch(request, init).catch(e => {
            this.log.warn('fetch error', e);
            return fetchAgent.Response(`${e.code} ${e.message}`, {
                status: 500,
            });
        });
    }

    private getResponseHead(response: Response) {
        return {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Array.from(response.headers.entries()),
            url: response.url,
            redirected: response.redirected,
            type: response.type,
        };
    }

    private encodeHead(
        pojo: Record<string, number | boolean | string | [string, string][]>
    ) {
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

    private async writeResponseHead(response: Response) {
        const responseHeadPojo = this.getResponseHead(response);
        const responseHeadBuffer = this.encodeHead(responseHeadPojo);
        const responseHeadChunks = this.chunkify(
            ChunkType.HEAD,
            responseHeadBuffer
        );
        this.log.trace(
            'writeResponseHead',
            responseHeadPojo,
            responseHeadChunks,
            responseHeadBuffer
        );
        for (const chunk of responseHeadChunks) {
            await this.write(chunk);
        }
    }

    private async writeResponseBody(response: Response) {
        this.log.debug('writeResponseBody', response);
        if (response.body instanceof ArrayBuffer) return;
        if (!response.body) return;
        for await (let chunk of response.body) {
            this.log.trace('writeResponseBody chunk', chunk);
            chunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            const chunks = this.chunkify(ChunkType.BODY, chunk);
            for (const chunk of chunks) {
                await this.write(chunk);
            }
        }
        this.log.debug('writeResponseBody done');
    }

    private async initOutbox() {
        let response = null;
        try {
            while (
                this.isOpen &&
                (response = await this.outbox.promise) != null
            ) {
                await this.writeResponseHead(response);
                await this.writeResponseBody(response);
                await this.write(Buffer.from([ChunkType.END]));
            }
        } catch (e) {
            this.log.warn('outbox error', e);
            await this.close();
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

    private async initProxy() {
        let request = null;
        while (this.isOpen && (request = await this.inbox.promise) != null) {
            const response = await this.fetch(request, {
                signal: this.abortController.signal as AbortSignal,
            })
                .catch(this.catchAbortError.bind(this))
                .catch(this.catchTimeoutError.bind(this));
            this.log.debug(
                'proxy got response',
                response.status,
                response.statusText
            );
            this.outbox.resolve(response);
            this.outbox = new Deferred<Response>();
        }
        this.log.debug('proxy done');
    }

    private catchAbortError = (e: FetchError) => {
        if (e.type === 'aborted') {
            this.log.debug('fetch aborted');
            return fetchAgent.Response('aborted', { status: 499 });
        }
        throw e;
    };

    private catchTimeoutError = (e: FetchError) => {
        // if error is a fetch timeout, return a 408 response
        if (e.code === 'ETIMEDOUT') {
            this.log.debug('fetch timeout');
            return fetchAgent.Response('', { status: 408 });
        }
        throw e;
    };

    private async receiveChunk(chunk: Buffer) {
        const type = chunk.readUInt8(0);
        const data = chunk.subarray(1);
        switch (type) {
            case ChunkType.HEAD:
                this.log.trace('receiveChunk', 'requestHead');
                await this.receiveRequestHead(data);
                break;
            case ChunkType.BODY:
                this.log.trace('receiveChunk', 'requestBody');
                this.receiveRequestBody(data);
                break;
            case ChunkType.END:
                this.log.trace('receiveChunk', 'requestEnd');
                this.receiveRequestEnd();
                break;
            case ChunkType.ABORT:
                this.log.trace('receiveChunk', 'requestAbort');
                await this.receiveRequestAbort();
                break;
            default:
                this.log.warn('receiveChunk', 'unknown chunk type', type);
        }
    }

    private async receiveRequestAbort() {
        this.requestBodyStream?.destroy();

        this.abortController?.abort();
        this.reset();
    }

    private async receiveRequestHead(chunk: Buffer) {
        this.requestHeadBuffer = Buffer.concat([this.requestHeadBuffer, chunk]);
        this.log.trace(
            'receiveRequestHead',
            this.requestHeadBuffer.length,
            this.requestHeadBuffer
        );
        if (this.requestHeadBuffer.byteLength < 2) return;
        const length = this.requestHeadBuffer.readUInt16BE(0);
        this.log.trace('receiveRequestHead got length', length);
        if (this.requestHeadBuffer.byteLength < length) return;
        const head = this.requestHeadBuffer.subarray(2, length);
        this.log.trace('receiveRequestHead got head', head.toString());
        this.requestHead = JSON.parse(head.toString());
        this.requestHeadBuffer = Buffer.alloc(0);
        if (this.requestBodyStream) {
            throw new Error('already have stream');
        }
        this.requestBodyStream = new Readable({
            read: () => {
                this.log.trace('requestBodyStream read');
            },
        });

        this.abortController = new AbortController();
        this.request = await fetchAgent.Request(
            this.requestHead?.url as RequestInfo,
            {
                ...this.requestHead,
                body: ['GET', 'HEAD', undefined].includes(
                    this.requestHead?.method
                )
                    ? undefined
                    : this.requestBodyStream,
            }
        );

        const inbox = this.inbox;
        this.inbox = new Deferred<Request>();
        if (this.request) {
            inbox.resolve(this.request);
        }
    }

    private receiveRequestBody(chunk: Buffer): void {
        this.log.trace('receiveRequestBody', chunk, this.requestBodyStream);
        this.requestBodyStream?.push(chunk);
        this.requestBodyStream?.resume();
    }

    private receiveRequestEnd() {
        this.log.trace('receiveRequestEnd');
        this.requestBodyStream?.push(null);
        this.reset();
    }

    reset() {
        this.requestHead = null;
        this.requestHeadBuffer = Buffer.alloc(0);
        this.requestBodyStream = null;
    }
}
