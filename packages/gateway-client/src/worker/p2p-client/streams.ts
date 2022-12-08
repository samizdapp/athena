import { Stream } from '@libp2p/interface-connection';
import { logger } from '../logging';
import { encode, decode, Packet } from '../p2p-fetch/lob-enc';
import transformers from '../transformers';

class Deferred<T> {
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
    protected eventTarget = new EventTarget();
    protected log = logger.getLogger('worker/p2p-client/streams');
    private writeBuffer: Buffer[] = [];
    private writeDeferred = new Deferred<null>();
    private source: AsyncIterator<Buffer> | null = null;

    constructor(private readonly libp2pStream: Stream) {
        this.libp2pStream.sink(this.sink()).catch(e => {
            this.log.warn('sink error', e);
            this.close();
        });
        this.source = this._source();
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
                this.log.trace('sink', next);
                yield next;
            }
            await this.writeDeferred.promise;
            this.writeDeferred = new Deferred<null>();
        }
    }

    private _write(data: Buffer | null) {
        this.log.trace('_write', data);
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

            this.log.trace('source', 'end');
        } catch (e) {
            this.log.warn('source error', e);
        } finally {
            this.close();
        }
    }

    public close() {
        this.libp2pStream.close();
        this.writeDeferred.resolve(null);
    }
}

export class HeartbeatStream extends RawStream {
    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.listen();
    }

    private async listen() {
        let data = null,
            timeout;
        while (this.isOpen && (data = await this.read()) != null) {
            this.log.trace('heartbeat', data);
            if (data.equals(Buffer.from('deadbeef', 'hex'))) {
                this.log.trace('heartbeat', 'received');
                clearTimeout(timeout);
                timeout = setTimeout(this.close.bind(this), 10000);
            }
        }
    }
}

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
        StreamPool.release(this);
    }
}
export class LobStream extends RawStream {
    private chunkSize = 1024 * 64;
    private outbox = new Deferred<Packet>();
    private inbox = new Deferred<Packet | null>();
    public hasInitialized = false;

    constructor(libp2pStream: Stream) {
        super(libp2pStream);
        this.initOutbox();
        this.initInbox().then(() => {
            this.log.debug('stream is closed');
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
                this.log.trace('inbox resolved', packet);
                this._receive(packet as Packet);
            }

            this.eventTarget.dispatchEvent(
                new CustomEvent('chunk', { detail: chunk })
            );
        }

        this.log.debug('stream stopped receiving data');
    }

    public send(packet: Packet): void {
        this.outbox.resolve(packet);
        this.outbox = new Deferred<Packet>();
    }

    public receive(): Promise<Packet | null> {
        return this.inbox.promise;
    }

    private async _receive(packet: Packet | null): Promise<void> {
        this.inbox.resolve(packet);
        this.inbox = new Deferred<Packet | null>();
    }
}

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
        StreamPool.release(this);
    }
}

export enum WebsocketStreamMessageType {
    COMMAND = 'COMMAND',
    MESSAGE = 'MESSAGE',
    STATUS = 'STATUS',
}

export enum WebsocketStreamStatus {
    OPENED = 'OPENED',
    CLOSED = 'CLOSED',
    ERROR = 'ERROR',
}

export class WebsocketStream extends LobStream {
    private portMap: Record<WebsocketStreamMessageType, MessagePort>;

    constructor(libp2pStream: Stream, ports: MessagePort[]) {
        super(libp2pStream);
        this.portMap = {
            [WebsocketStreamMessageType.STATUS]: ports[0],
            [WebsocketStreamMessageType.MESSAGE]: ports[1],
            [WebsocketStreamMessageType.COMMAND]: ports[2],
        };
        this.startSending();
        this.startReceiving();
    }

    private makePortMessageHandler(type: WebsocketStreamMessageType) {
        return (event: MessageEvent) => {
            this.log.debug(`${type}`, event.data);
            const message = this.encodeMessageToPacket(
                type,
                Buffer.from(event.data)
            );
            this.send(message);
        };
    }

    private startSending() {
        for (const [type, port] of Object.entries(this.portMap)) {
            port.onmessage = this.makePortMessageHandler(
                type as WebsocketStreamMessageType
            );
        }
    }

    private async startReceiving() {
        let packet = null;

        while (this.isOpen && (packet = await this.receive()) !== null) {
            this.dispatch(packet);
        }

        this.log.debug('websocket stream stopped receiving data');

        this.dispatchStatus(
            WebsocketStreamStatus.CLOSED,
            JSON.stringify({
                code: 1001,
                reason: 'Stream closed',
                wasClean: true,
            })
        );
    }

    private encodeMessageToPacket(
        type: WebsocketStreamMessageType,
        buffer: Buffer
    ): Packet {
        return encode({ type, bodyLength: buffer.byteLength }, buffer);
    }

    private getClientPort(type: WebsocketStreamMessageType): MessagePort {
        const port = this.portMap[type];
        if (!port) {
            throw new Error(`No port for type ${type}`);
        }
        return port;
    }

    private dispatch(packet: Packet): void {
        this.log.debug('dispatch', packet.json.type);
        this.getClientPort(
            packet.json.type as WebsocketStreamMessageType
        ).postMessage(packet.body, [packet.body.buffer]);
    }

    private dispatchStatus(
        status: WebsocketStreamStatus,
        detail?: string
    ): void {
        const body = Buffer.from(JSON.stringify({ status, detail }));
        this.getClientPort(WebsocketStreamMessageType.STATUS).postMessage(
            body,
            [body.buffer]
        );
    }
}

export type StreamConstructor = new (
    raw: Stream,
    ports?: MessagePort[]
) => SamizdappStream;

export declare type SamizdappStream =
    | RawStream
    | RequestStream
    | LobStream
    | WebsocketStream;
