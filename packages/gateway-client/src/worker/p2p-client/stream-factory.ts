import { Stream } from '@libp2p/interface-connection';
import { PeerId } from '@libp2p/interface-peer-id';

import type { P2pClient } from '.';
import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';
import { decode } from '../p2p-fetch/lob-enc';

type Trigger = (value?: unknown) => void;

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

export class WrappedStream {
    private log = logger.getLogger('worker/p2p/wrapped-stream');
    private outbox: Uint8Array[] = [];
    private inbox: Uint8Array[] = [];
    outboxTrigger: Trigger = () => {
        // noop
    };
    private inboxTrigger: Trigger = () => {
        // noop
    };

    get isOpen(): boolean {
        return this.stream.stat.timeline.close === undefined;
    }

    constructor(private readonly stream: Stream) {}

    public async request(chunks: Uint8Array[]): Promise<Buffer[]> {
        this.outbox = chunks;
        this.outboxTrigger();
        await new Promise(r => {
            this.inboxTrigger = r;
        });
        console.log('inboxTrigger called');
        const bufs = this.inbox.map(Buffer.from);
        this.inbox = [];
        return bufs;
    }

    public close(): void {
        this.stream.close();
    }

    public async open(): Promise<void> {
        this.stream.sink(
            (async function* (wrapped) {
                while (true) {
                    await new Promise(r => {
                        wrapped.outboxTrigger = r;
                    });

                    for await (const chunk of wrapped.outbox) {
                        // console.log('sending chunk', chunk);
                        yield chunk;
                    }
                }
            })(this)
        );

        let currentLength = 0;
        let headLength = 0;
        let totalLength = 0;
        for await (const chunk of this.stream.source) {
            const buf = Buffer.from(chunk.subarray());
            // console.log('got chunk', buf);
            this.inbox.push(buf);
            if (headLength === 0) {
                headLength = buf.readUInt16BE(0) + 2;
            }
            currentLength += buf.length;
            if (totalLength === 0 && currentLength >= headLength) {
                const packet = decode(Buffer.concat(this.inbox));
                totalLength =
                    ((packet?.json?.bodyLength as number) ?? 0) + headLength;
            }
            if (currentLength === totalLength) {
                currentLength = 0;
                headLength = 0;
                totalLength = 0;
                this.inboxTrigger();
            }
        }

        this.log.debug('stream stopped receiving data');

        this.close();
    }
}

export class StreamFactory {
    private log = logger.getLogger('worker/p2p/stream');

    private inTimeout = false;
    private retryTimeout = 0;
    private dialTimeout: number;
    private availableStreams: WrappedStream[] = [];

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

    public async getProxyStream() {
        do {
            const stream = this.availableStreams.pop();
            if (stream?.isOpen) {
                return stream;
            }
        } while (this.availableStreams.length > 0);

        const wrapped = new WrappedStream(
            await this.getStream('/samizdapp-proxy/2.0.0')
        );
        wrapped.open();
        return wrapped;
    }

    public releaseProxyStream(stream: WrappedStream) {
        this.availableStreams.push(stream);
    }

    public closeStream(stream: WrappedStream) {
        stream.close();
    }
}
