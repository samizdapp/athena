import { Stream } from '@libp2p/interface-connection';
import { EventEmitter } from 'events';
import { logger } from '../logging';
import { encode, decode, Packet } from '../p2p-fetch/lob-enc';

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

declare type Callback = (err?: Error) => void;

export class RawStream extends EventEmitter {
    log = logger.getLogger('worker/p2p/streams');
    private readDeferred = new Deferred<Buffer | null>();
    private writeDeferred = new Deferred<Buffer | null>();

    get isOpen(): boolean {
        return this.libp2pStream.stat.timeline.close === undefined;
    }

    get protocol(): string | undefined {
        return this.libp2pStream.stat.protocol;
    }

    constructor(
        private readonly libp2pStream: Stream,
        private readonly ports?: MessagePort[]
    ) {
        super();
        this.libp2pStream.sink(this.sink());
        this.source();
    }

    public async read(): Promise<Buffer | null> {
        return this.readDeferred.promise.then(data => {
            this.log.trace('read', data);
            return data;
        });
    }

    public async write(data: Buffer): Promise<void> {
        return this._write(data);
    }

    private async *sink() {
        let data = null;
        while (
            this.isOpen &&
            (data = await this.writeDeferred.promise) != null
        ) {
            this.log.trace('sink', data);
            yield data;
        }
    }

    private _write(data: Buffer | null) {
        this.log.trace('_write', data);
        this.writeDeferred.resolve(data);
        this.writeDeferred = new Deferred<Buffer | null>();
    }

    private _read(data: Buffer | null) {
        this.log.trace('_read', data);
        this.readDeferred.resolve(data);
        this.readDeferred = new Deferred<Buffer | null>();
    }

    private async source() {
        for await (const data of this.libp2pStream.source) {
            this._read(Buffer.from(data.subarray()));
        }

        this.log.trace('source', 'end');
        this.close();
    }

    public close() {
        this.libp2pStream.close();
        this.readDeferred.resolve(null);
        this.writeDeferred.resolve(null);
    }
}

export class LobStream extends RawStream {
    private chunkSize = 64 * 1024;
    private outbox = new Deferred<Packet>();
    private inbox = new Deferred<Packet | null>();
    private onChunk?: Callback;
    private onClose?: Callback;
    private onError?: Callback;
    public hasInitialized = false;

    constructor(libp2pStream: Stream, ports?: MessagePort[]) {
        super(libp2pStream, ports);
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
                this.write(chunk);
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

        while ((chunk = await this.read()) !== null) {
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

            this.emit('chunk', chunk);
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

export class PooledLobStream extends LobStream {
    private static pool: Set<PooledLobStream> = new Set();

    static getFromPool(
        protocol: string,
        Constructor: typeof PooledLobStream
    ): PooledLobStream | null {
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

    public release() {
        PooledLobStream.pool.add(this);
    }
}

export class RequestStream extends PooledLobStream {
    public async request(
        packet: Packet,
        onChunk?: Callback
    ): Promise<Packet | null> {
        if (onChunk) {
            this.addListener('chunk', onChunk);
        }
        this.send(packet);
        const response = await this.receive();
        if (onChunk) {
            this.removeListener('chunk', onChunk);
        }

        return response;
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

// TODO: ask joshua how to stop ts complaining about overrides
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export class WebsocketStream extends LobStream {
    private statusPort: MessagePort;
    private commandPort: MessagePort;
    private messagePort: MessagePort;

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

    constructor(libp2pStream: Stream, ports: MessagePort[]) {
        super(libp2pStream, ports);
        this.statusPort = ports[0];
        this.messagePort = ports[1];
        this.commandPort = ports[2];
        this.startSending();
        this.startReceiving();
    }

    private startSending() {
        this.commandPort.onmessage = this.makePortMessageHandler(
            WebsocketStreamMessageType.COMMAND
        );
        this.messagePort.onmessage = this.makePortMessageHandler(
            WebsocketStreamMessageType.MESSAGE
        );
        this.statusPort.onmessage = this.makePortMessageHandler(
            WebsocketStreamMessageType.STATUS
        );
    }

    private async startReceiving() {
        let packet = null;

        while ((packet = await this.receive()) !== null) {
            this.dispatch(packet);
        }

        this.dispatchStatus(WebsocketStreamStatus.CLOSED);
    }

    private encodeMessageToPacket(
        type: WebsocketStreamMessageType,
        buffer: Buffer
    ): Packet {
        return encode({ type, bodyLength: buffer.byteLength }, buffer);
    }

    private getClientPort(type: WebsocketStreamMessageType): MessagePort {
        switch (type) {
            case WebsocketStreamMessageType.MESSAGE:
                return this.messagePort;
            case WebsocketStreamMessageType.STATUS:
                return this.statusPort;
            case WebsocketStreamMessageType.COMMAND:
                return this.commandPort;
            default:
                throw new Error('Invalid websocket message type: ' + type);
        }
    }

    private dispatch(packet: Packet): void {
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

export declare type StreamConstructor =
    | typeof RawStream
    | typeof LobStream
    | typeof WebsocketStream
    | typeof RequestStream;

export declare type SamizdappStream =
    | RawStream
    | RequestStream
    | LobStream
    | WebsocketStream;
