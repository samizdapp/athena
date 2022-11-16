import { Stream } from '@libp2p/interface-connection';
import { PeerId } from '@libp2p/interface-peer-id';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import Multiaddr from 'multiaddr';

import type { P2pClient } from '.';
import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';
import { BootstrapList } from './bootstrap-list';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

export class StreamFactory {
    private log = logger.getLogger('worker/p2p/stream');

    private locked = false;
    private retryTimeout = 0;
    private dialTimeout: number;

    public constructor(
        private maxDialTimeout: number,
        private serverPeer: PeerId,
        private client: P2pClient,
        private bootstrapList: BootstrapList
    ) {
        this.dialTimeout = maxDialTimeout;
    }

    private async makeStream(
        protocol: string,
        _piperId: string
    ): Promise<Stream> {
        this.log.trace('Get stream for protocol: ', protocol);
        let streamOrNull = null;
        while (!streamOrNull) {
            while (this.locked) {
                this.log.info('Waiting for lock reset...');
                await waitFor(100);
            }
            // attempt to dial our peer, track the time it takes
            const start = Date.now();
            streamOrNull = await Promise.race([
                this.client.node
                    ?.dialProtocol(this.serverPeer, protocol)
                    .catch(e => {
                        this.log.trace('dialProtocol error: ', e);
                        this.log.trace('Time: ', Date.now() - start);
                        return null;
                    }),
                waitFor(this.dialTimeout),
            ]);

            // if we successfully, dialed, we have a stream
            if (streamOrNull) {
                // reset our timeouts
                // use the time of the dial to calculate an
                // appropriate dial timeout
                this.dialTimeout = Math.max(
                    this.maxDialTimeout,
                    Math.floor((Date.now() - start) * 4)
                );
                this.retryTimeout = 0;
                // if we were NOT previously connected
                if (status.serverPeer !== ServerPeerStatus.CONNECTED) {
                    // we are now
                    status.serverPeer = ServerPeerStatus.CONNECTED;
                }
                // we have a stream, we can quit now
                this.log.trace(
                    'Got stream for protocol: ',
                    protocol,
                    streamOrNull
                );
                break;
            } else if (!this.locked) {
                this.locked = true;

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

                // wait before retrying
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
                this.dialTimeout = Math.min(
                    1000 * 60 * 5,
                    this.dialTimeout * 4
                );

                // now that we've waiting, we can retry
                // locked = true;
                this.log.info('Resetting libp2p...');
                const _s = Date.now();
                let bootstraplist = await this.bootstrapList.getBootstrapList(
                    true
                );
                if (this.retryTimeout >= 2000) {
                    bootstraplist = await this.bootstrapList.initCheckAddresses(
                        bootstraplist
                    );
                }

                await this.client.node?.stop();
                await this.client.node?.start();
                const relays = bootstraplist.map(
                    s => Multiaddr.multiaddr(s) as unknown as MultiaddrType
                );
                await this.client.node?.peerStore.addressBook
                    .add(this.serverPeer, relays)
                    .catch(_ => _);
                this.log.debug('Reset time: ', Date.now() - _s);
                this.locked = false;
            }
        }
        return streamOrNull;
    }

    public async getStream(
        protocol = '/samizdapp-proxy',
        id: string = crypto.randomUUID()
    ) {
        return this.makeStream(protocol, id);
    }
}
