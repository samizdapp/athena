import { Noise } from '@chainsafe/libp2p-noise';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import type { Address } from '@libp2p/interface-peer-store';
import { KEEP_ALIVE } from '@libp2p/interface-peer-store/tags';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import { Mplex } from '@libp2p/mplex';
import { WebSockets } from '@libp2p/websockets';
import { all as filtersAll } from '@libp2p/websockets/filters';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import { createLibp2p, Libp2p } from 'libp2p';

import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import status from '../status';
import { BootstrapList } from './bootstrap-list';
import { initLibp2pLogging } from './libp2p-logging';
import { StreamFactory } from './stream-factory';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

export class P2pClient {
    private log = logger.getLogger('worker/p2p/client');

    private DIAL_TIMEOUT = 3000;

    private streamFactory?: StreamFactory;
    private bootstrapList: BootstrapList;
    private eventTarget = new EventTarget();

    private serverPeer?: PeerId;
    public node?: Libp2p;

    public constructor() {
        this.bootstrapList = new BootstrapList(this);
    }

    public async addServerPeerAddress(multiaddr: MultiaddrType) {
        if (!this.serverPeer) {
            throw new Error('No server peer.');
        }

        await this.node?.peerStore.addressBook
            .add(this.serverPeer, [multiaddr])
            .catch(_ => _);
    }

    public getStream(protocol?: string, id?: string) {
        if (!this.streamFactory) {
            throw new Error('No connection established!');
        }

        return this.streamFactory.getStream(protocol, id);
    }

    public async start() {
        // load our bootstrap list
        await this.bootstrapList.load();

        // update status
        status.serverPeer = ServerPeerStatus.BOOTSTRAPPED;

        // create libp2p node
        this.node = await createLibp2p({
            // datastore,
            transports: [
                new WebSockets({
                    filter: filtersAll,
                }),
            ],
            connectionEncryption: [
                new Noise() as unknown as ConnectionEncrypter,
            ],
            streamMuxers: [new Mplex() as StreamMuxerFactory],
            peerDiscovery: [this.bootstrapList],
            connectionManager: {
                autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minConnections)
                minConnections: 3,
                maxDialsPerPeer: 20,
                maxParallelDials: 20,
                addressSorter: (a: Address, b: Address) =>
                    this.bootstrapList.libp2pAddressSorter(a, b),
            },
            relay: {
                // Circuit Relay options (this config is part of libp2p core configurations)
                // The circuit relay is a second transporter that is configured in libp2p (is tried after Websockets)
                enabled: true, // Allows you to dial and accept relayed connections. Does not make you a relay.
                autoRelay: {
                    enabled: true, // Allows you to bind to relays with HOP enabled for improving node dialability
                    maxListeners: 5, // Configure maximum number of HOP relays to use
                },
            },
            identify: {
                host: {
                    agentVersion: `smz-pwa/0.0.0`,
                },
            },
        });

        // init libp2p logging
        initLibp2pLogging();

        // add event listeners
        this.node.addEventListener('peer:discovery', evt => {
            const peer = evt.detail;
            this.log.info(`Found peer ${peer.id.toString()}`);
        });

        // Listen for new connections to peers
        this.node.connectionManager.addEventListener(
            'peer:connect',
            async evt => {
                try {
                    // log connection details
                    const connection = evt.detail;
                    const str_id = connection.remotePeer.toString();
                    this.log.info(`Connected to: `, {
                        server: str_id,
                        via: connection.remoteAddr.toString(),
                    });

                    // if this is not our server
                    const serverMatch = str_id === this.bootstrapList.serverId;
                    this.log.info(
                        `Server match: ${serverMatch} (${str_id} ${
                            serverMatch ? '=' : '!'
                        }== ${this.bootstrapList.serverId})`
                    );
                    if (!serverMatch) {
                        // then there is no more to do
                        return;
                    } // else, we've connected to our server

                    this.serverPeer = connection.remotePeer;
                    this.streamFactory = new StreamFactory(
                        this.DIAL_TIMEOUT,
                        this.serverPeer,
                        this
                    );

                    // update status
                    status.serverPeer = ServerPeerStatus.CONNECTED;

                    // set keep-alive on connection
                    try {
                        await this.node?.peerStore
                            .tagPeer(connection.remotePeer, KEEP_ALIVE)
                            .catch(_ => null);
                    } catch (e) {
                        // ignore tagging errors
                    }

                    this.dispatchEvent('connected');
                } catch (e) {
                    this.dispatchEvent('connectionerror', e);
                }
            }
        );

        // Listen for peers disconnecting
        this.node.connectionManager.addEventListener('peer:disconnect', evt => {
            const connection = evt.detail;
            this.log.info(
                `Disconnected from ${connection.remotePeer.toString()}`
            );
            if (
                this.serverPeer &&
                connection.remotePeer.equals(this.serverPeer)
            ) {
                this.log.info('Disconnected from server.');
                // update status
                status.serverPeer = ServerPeerStatus.CONNECTING;
                this.node?.dial(this.serverPeer);
            }
        });

        this.log.debug('Starting libp2p...');
        await this.node.start();
        this.log.info('Started libp2p.');

        // update status
        status.serverPeer = ServerPeerStatus.CONNECTING;

        waitFor(15000).then(() => {
            if (status.serverPeer === ServerPeerStatus.CONNECTING) {
                status.serverPeer = ServerPeerStatus.OFFLINE;
            }
        });
    }

    public async restart() {
        // reset libp2p, track reset time
        this.log.info('Resetting libp2p...');
        const _s = Date.now();
        // refresh our bootstrap list stats so that the node gets an updated order
        this.bootstrapList.refreshStats();
        // try turning it off and on again
        await this.node?.stop();
        await this.node?.start();
        // log reset time
        this.log.trace('Reset time: ', Date.now() - _s);
    }

    private dispatchEvent<T>(type: string, detail?: T) {
        this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
    }

    public addEventListener(
        type: string,
        listener: (evt: CustomEvent) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        this.eventTarget.addEventListener(
            type,
            listener as EventListener,
            options
        );
    }

    public removeEventListener(
        type: string,
        listener: (evt: CustomEvent) => void,
        options?: boolean | EventListenerOptions
    ): void {
        this.eventTarget.removeEventListener(
            type,
            listener as EventListener,
            options
        );
    }
}
