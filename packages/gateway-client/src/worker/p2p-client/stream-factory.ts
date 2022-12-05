import { Stream } from '@libp2p/interface-connection';
import { PeerId } from '@libp2p/interface-peer-id';

import type { P2pClient } from '.';
import { ServerPeerStatus, WorkerMessageType } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';
import {
    StreamConstructor,
    RawStream,
    WebsocketStream,
    PooledLobStream,
    RequestStream,
    SamizdappStream,
    HeartbeatStream,
} from './streams';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));
export class StreamFactory {
    private log = logger.getLogger('worker/p2p/stream');

    private inTimeout = false;
    private retryTimeout = 0;
    private dialTimeout: number;

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
            stream = await this.client
                .performDialAction(
                    signal =>
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.client.node!.dialProtocol(
                            this.serverPeer,
                            protocol,
                            {
                                signal,
                            }
                        ),
                    this.dialTimeout
                )
                .catch(e => {
                    const log = ['dialProtocol error: ', e];
                    if (['ERR_UNSUPPORTED_PROTOCOL'].includes(e.code)) {
                        this.log.error(...log);
                    } else {
                        this.log.debug(...log);
                    }
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

            // if our retry timeout reaches 7 seconds, then we'll have
            // been retrying for 28 seconds (triangle number of 7).
            // By this point, we're probably offline.
            if (
                status.serverPeer !== ServerPeerStatus.OFFLINE &&
                this.retryTimeout >= 7000
            ) {
                status.serverPeer = ServerPeerStatus.OFFLINE;
            }

            // wait awhile before retrying the stream again
            this.log.info('Dial timeout, waiting to retry...', {
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

            // now that we've waited awhile, we can try again
            this.inTimeout = false;
        }

        // our loop will continue until we have a stream, which we now do
        return stream;
    }

    public async getStream(
        protocol = '/samizdapp-proxy',
        Constructor: StreamConstructor = RawStream,
        ports: MessagePort[] = []
    ): Promise<SamizdappStream> {
        let stream = null;
        // if our constructor is a subclass of PooledLobStream, try to get it
        // from the pool
        if (Constructor.prototype instanceof PooledLobStream) {
            stream = PooledLobStream.getFromPool(
                protocol,
                Constructor as unknown as typeof PooledLobStream
            );
            if (stream) {
                return stream;
            }
        }

        // either it's not a pooled stream, or the pool didn't have one
        // so we need to make a new one
        const rawStream = await this.makeStream(protocol);
        stream = new Constructor(rawStream, ports);
        return stream;
    }

    public async getRequestStream(
        protocol = '/samizdapp-proxy/2.0.0'
    ): Promise<RequestStream> {
        this.log.debug('get request stream');
        return this.getStream(
            protocol,
            RequestStream
        ) as Promise<RequestStream>;
    }

    public async getWebsocketStream(
        ports: MessagePort[]
    ): Promise<WebsocketStream> {
        this.log.debug('Get websocket stream');
        return this.getStream(
            '/samizdapp-websocket',
            WebsocketStream as unknown as StreamConstructor,
            ports
        ) as Promise<WebsocketStream>;
    }

    public async getHeartbeatStream(): Promise<HeartbeatStream> {
        this.log.debug('Get heartbeat stream');
        return this.getStream(
            '/samizdapp-heartbeat',
            HeartbeatStream
        ) as Promise<HeartbeatStream>;
    }
}
