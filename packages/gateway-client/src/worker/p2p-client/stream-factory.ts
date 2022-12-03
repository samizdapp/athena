import { Stream } from '@libp2p/interface-connection';
import { PeerId } from '@libp2p/interface-peer-id';

import type { P2pClient } from '.';
import { ServerPeerStatus, WorkerMessageType } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';
import { decode, encode, Packet } from '../p2p-fetch/lob-enc';
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

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

declare type ChunkCallback = () => void;
export class RequestStream {
    private log = logger.getLogger('worker/p2p/request-stream');
    private outbox = new Deferred<Buffer[]>();
    private inbox = new Deferred<Buffer[]>();
    private hasOpened = false;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private chunkCallback?: ChunkCallback;

    get isOpen(): boolean {
        return this.stream.stat.timeline.close === undefined;
    }

    constructor(private readonly stream: Stream) {}

    // set up stream for continual send/receive
    public async open(): Promise<void> {
        this.hasOpened = true;
        // we can only call sink once, so we need to provide a generator
        // that will yield chunks from the outbox
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        this.stream.sink(
            (async function* () {
                while (true) {
                    const chunks = await that.outbox.promise;

                    for await (const chunk of chunks) {
                        yield chunk;
                    }
                }
            })()
        );

        // we can read from the stream source as many times as we want
        // so we can just read chunks and put them in the inbox
        let inboxLocal = [];
        let currentLength = 0;
        let headLength = 0;
        let totalLength = 0;
        for await (const chunk of this.stream.source) {
            const buf = Buffer.from(chunk.subarray());
            inboxLocal.push(buf);
            // first 2 bytes are the length of the packet json portion
            if (headLength === 0) {
                headLength = buf.readUInt16BE(0) + 2;
            }
            currentLength += buf.length;
            // if we haven't read the packet json yet, we don't know the
            // total length of the packet, so we can't know when we're done
            if (totalLength === 0 && currentLength >= headLength) {
                const packet = decode(Buffer.concat(inboxLocal));
                totalLength =
                    ((packet?.json?.bodyLength as number) ?? 0) + headLength;
            }
            // if we've read the packet json and we've got the total length
            // of the packet, we can resolve the inbox
            if (currentLength === totalLength) {
                currentLength = 0;
                headLength = 0;
                totalLength = 0;
                this.receive(inboxLocal);
                inboxLocal = [];
            }
            this.chunkCallback?.();
        }

        this.log.debug('stream stopped receiving data');

        this.close();
    }

    private async send(chunks: Buffer[]): Promise<void> {
        this.outbox.resolve(chunks);
        this.outbox = new Deferred<Buffer[]>();
    }

    private async receive(chunks: Buffer[]): Promise<void> {
        this.inbox.resolve(chunks);
        this.inbox = new Deferred<Buffer[]>();
    }

    public async request(
        chunks: Buffer[],
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        chunkCallback?: ChunkCallback
    ): Promise<Buffer[]> {
        this.chunkCallback = chunkCallback;
        if (!this.hasOpened) {
            throw new Error('send: Stream not opened');
        }
        await this.send(chunks);
        return this.inbox.promise;
    }

    public close(): void {
        this.stream.close();
    }
}

enum WebsocketStreamMessageType {
    COMMAND = 'COMMAND',
    MESSAGE = 'MESSAGE',
    STATUS = 'STATUS',
}

export enum WebsocketStreamStatus {
    OPENED = 'OPENED',
    CLOSED = 'CLOSED',
}

export class WebsocketStream {
    private chunkSize = 1024 * 64;
    private log = logger.getLogger('worker/p2p/websocket-stream');
    private outbox = new Deferred<Packet>();
    private inbox = new Deferred<Buffer[]>();
    private hasOpened = false;

    get isOpen(): boolean {
        return this.stream.stat.timeline.close === undefined;
    }

    constructor(
        private readonly stream: Stream,
        private readonly statusPort: MessagePort,
        private readonly messagePort: MessagePort,
        private readonly commandPort: MessagePort
    ) {
        this.commandPort.onmessage = this.onCommand.bind(this);
        this.messagePort.onmessage = this.onMessage.bind(this);
        this.statusPort.onmessage = this.onStatus.bind(this);
    }

    private encodeMessageToPacket(
        type: WebsocketStreamMessageType,
        buffer: Buffer
    ): Packet {
        return encode({ type, bodyLength: buffer.byteLength }, buffer);
    }

    private onCommand(event: MessageEvent): void {
        this.log.debug('onCommand', event.data);
        const message = this.encodeMessageToPacket(
            WebsocketStreamMessageType.COMMAND,
            Buffer.from(event.data)
        );
        this.send(message);
    }

    private onMessage(event: MessageEvent): void {
        this.log.debug('onMessage', event.data);
        const message = this.encodeMessageToPacket(
            WebsocketStreamMessageType.MESSAGE,
            Buffer.from(event.data)
        );
        this.send(message);
    }

    private onStatus(event: MessageEvent): void {
        this.log.debug('onStatus', event.data);
        const message = this.encodeMessageToPacket(
            WebsocketStreamMessageType.STATUS,
            Buffer.from(event.data)
        );
        this.send(message);
    }

    private async send(packet: Packet): Promise<void> {
        this.outbox.resolve(packet);
        this.outbox = new Deferred<Packet>();
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

    // set up stream for continual send/receive
    public async open(): Promise<void> {
        this.hasOpened = true;
        // we can only call sink once, so we need to provide a generator
        // that will yield chunks from the outbox
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        this.stream.sink(
            (async function* () {
                while (true) {
                    const packet = await that.outbox.promise;

                    const parts: Buffer[] = [];
                    for (
                        let i = 0;
                        i <= Math.floor(packet.length / that.chunkSize);
                        i++
                    ) {
                        parts.push(
                            packet.subarray(
                                i * that.chunkSize,
                                (i + 1) * that.chunkSize
                            )
                        );
                    }

                    for await (const chunk of parts) {
                        yield chunk;
                    }
                }
            })()
        );

        // we can read from the stream source as many times as we want
        // so we can just read chunks and put them in the inbox
        let inboxLocal = [];
        let currentLength = 0;
        let headLength = 0;
        let totalLength = 0;
        for await (const chunk of this.stream.source) {
            const buf = Buffer.from(chunk.subarray());
            this.log.trace('received chunk', buf);
            inboxLocal.push(buf);
            // first 2 bytes are the length of the packet json portion
            if (headLength === 0) {
                headLength = buf.readUInt16BE(0) + 2;
            }
            currentLength += buf.length;
            // if we haven't read the packet json yet, we don't know the
            // total length of the packet, so we can't know when we're done
            let packet;
            if (totalLength === 0 && currentLength >= headLength) {
                packet = decode(Buffer.concat(inboxLocal));
                totalLength =
                    ((packet?.json?.bodyLength as number) ?? 0) + headLength;
            }
            // if we've read the packet json and we've got the total length
            // of the packet, we can resolve the inbox
            if (currentLength === totalLength) {
                packet = packet || decode(Buffer.concat(inboxLocal));
                currentLength = 0;
                headLength = 0;
                totalLength = 0;
                inboxLocal = [];
                this.dispatch(packet as Packet);
            }
        }

        this.log.debug('stream stopped receiving data');

        this.dispatchStatus(WebsocketStreamStatus.CLOSED);
    }
}

export class StreamFactory {
    private log = logger.getLogger('worker/p2p/stream');

    private inTimeout = false;
    private retryTimeout = 0;
    private dialTimeout: number;
    private requestStreamPool: RequestStream[] = [];

    public constructor(
        private maxDialTimeout: number,
        private serverPeer: PeerId,
        private client: P2pClient
    ) {
        this.dialTimeout = maxDialTimeout;
    }

    private async makeStream(protocol: string) {
        this.log.trace('Get stream for protocol: ', protocol);

        // we need to be connected
        if (!this.client.node) {
            throw new Error('No client connection established!');
        }

        // start with no stream
        let stream: Stream | null = null;
        while (!stream) {
            // if we're currently in timeout, wait until we're not
            while (this.inTimeout) {
                this.log.trace('Waiting for timeout to end...');
                await waitFor(100);
            }

            // attempt to dial our peer, track the time it takes
            const start = Date.now();
            // timeout after configured timeout
            const abortController = new AbortController();
            const signal = abortController.signal;
            waitFor(this.dialTimeout).then(() => abortController.abort());
            // initiate dial
            stream = await this.client.node
                .dialProtocol(this.serverPeer, protocol, { signal })
                .catch(e => {
                    this.log.trace('dialProtocol error: ', e);
                    this.log.trace('Time: ', Date.now() - start);
                    return null;
                });

            // if we successfully opened a stream
            if (stream) {
                // reset our timeouts
                this.retryTimeout = 0;
                // use the time of the dial to calculate an
                // appropriate dial timeout
                this.dialTimeout = Math.max(
                    this.maxDialTimeout,
                    Math.floor((Date.now() - start) * 4)
                );

                // if we were NOT previously connected
                if (status.serverPeer !== ServerPeerStatus.CONNECTED) {
                    // we are now
                    status.serverPeer = ServerPeerStatus.CONNECTED;
                }
                // we have a stream, so we can quit now
                this.log.trace('Got stream for protocol: ', protocol, stream);
                break;
            }

            // if we're currently in timeout
            if (this.inTimeout) {
                // we're already in timeout, so there is nothing more to do
                this.log.trace('Already in timeout, waiting...');
                continue;
            }

            // else, we need to put ourselves in timeout
            // not only are we going to wait for the specified timeout period,
            // but we will also force any concurrent calls to wait as well
            this.inTimeout = true;

            // else, we failed to open a stream
            // this is a connection error, if we were previously connected
            if (status.serverPeer === ServerPeerStatus.CONNECTED) {
                // we aren't anymore
                status.serverPeer = ServerPeerStatus.CONNECTING;
            }

            // if our retry timeout reaches 5 seconds, then we'll have
            // been retrying for 15 seconds (triangle number of 5).
            // By this point, we're probably offline.
            if (
                status.serverPeer !== ServerPeerStatus.OFFLINE &&
                this.retryTimeout >= 5000
            ) {
                status.serverPeer = ServerPeerStatus.OFFLINE;
            }

            // wait awhile before retrying the stream again
            this.log.info('Dial timeout, waiting to reset...', {
                dialTimeout: this.dialTimeout,
                retryTimeout: this.retryTimeout,
            });
            await waitFor(this.retryTimeout);

            // if our retry timeout reaches 30 seconds, then we'll have
            // been retrying for 5 minutes 45 seconds
            // (triangle number of 30)
            // time to reset
            if (this.retryTimeout >= 30000) {
                this.retryTimeout = 0;
            }
            // increase our retry timeout
            this.retryTimeout += 1000;
            // increase our dial timeout, but never make it higher than
            // 5 minutes
            this.dialTimeout = Math.min(1000 * 60 * 5, this.dialTimeout * 4);

            // now that we've waited awhile, we can attempt to reconnect to our server
            await this.client.connectToServer();
            // and try again
            this.inTimeout = false;
        }

        // our loop will continue until we have a stream, which we now do
        return stream;
    }

    public async getStream(protocol = '/samizdapp-proxy') {
        return this.makeStream(protocol);
    }

    public async getRequestStream(protocol = '/samizdapp-proxy/2.0.0') {
        // TODO - we should have a proper abstraction for this
        do {
            const stream = this.requestStreamPool.pop();
            if (stream?.isOpen) {
                return stream;
            }
        } while (this.requestStreamPool.length > 0);
        const rawStream = await this.getStream(protocol);
        const stream = new RequestStream(rawStream);
        stream.open();
        return stream;
    }

    public releaseRequestStream(stream: RequestStream) {
        this.requestStreamPool.push(stream);
    }

    public async getWebsocketStream(ports: MessagePort[]) {
        this.log.debug('Get websocket stream');
        const rawStream = await this.getStream('/samizdapp-websocket');
        const stream = new WebsocketStream(
            rawStream,
            ports[0],
            ports[1],
            ports[2]
        );
        stream.open();
        return stream;
    }
}
