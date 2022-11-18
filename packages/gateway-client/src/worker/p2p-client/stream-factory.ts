import { Stream } from '@libp2p/interface-connection';
import { PeerId } from '@libp2p/interface-peer-id';

import type { P2pClient } from '.';
import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';

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

    private async makeStream(protocol: string, _piperId: string) {
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

    public async getStream(
        protocol = '/samizdapp-proxy',
        id: string = crypto.randomUUID()
    ) {
        return this.makeStream(protocol, id);
    }
}
