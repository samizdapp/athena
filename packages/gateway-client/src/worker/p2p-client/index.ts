import { Noise } from '@chainsafe/libp2p-noise';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { Connection } from '@libp2p/interface-connection';
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
import { StreamFactory, WrappedStream } from './stream-factory';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

export class P2pClient {
    private log = logger.getLogger('worker/p2p/client');

    private DIAL_TIMEOUT = 3000;

    private streamFactory?: StreamFactory;
    private bootstrapList: BootstrapList;
    private eventTarget = new EventTarget();

    private serverPeer?: PeerId;
    private serverConnection?: Promise<Connection>;
    public node?: Libp2p;
    private _connectionStatus: ServerPeerStatus = ServerPeerStatus.OFFLINE;

    public constructor() {
        this.bootstrapList = new BootstrapList(this);
    }

    public get connectionStatus(): ServerPeerStatus {
        return this._connectionStatus;
    }

    public set connectionStatus(connectionStatus: ServerPeerStatus) {
        this._connectionStatus = connectionStatus;
        status.serverPeer = connectionStatus;
    }

    public async addServerPeerAddress(multiaddr: MultiaddrType) {
        if (!this.serverPeer) {
            throw new Error('No server peer discovered.');
        }

        await this.node?.peerStore.addressBook
            .add(this.serverPeer, [multiaddr])
            .catch(_ => _);
    }

    public getStream(protocol?: string) {
        if (!this.streamFactory) {
            throw new Error('No connection established!');
        }

        return this.streamFactory.getStream(protocol);
    }

    public async connectToServer(retryTimeout = 1000): Promise<Connection> {
        // if we haven't started yet
        if (!this.node) {
            throw new Error(
                'Connection attempted before P2P client was started!'
            );
        }

        // we'll also need to have discovered our peer
        if (!this.serverPeer) {
            throw new Error(
                'Connection attempted before server peer discovered!'
            );
        }

        // if we already have a connection (completed or pending)
        if (this.serverConnection) {
            // get the connection so we can take a closer look at it
            let connection;
            try {
                connection = await this.serverConnection;
            } catch (e) {
                // ignore errors
            }
            // if this connection:
            // - exists
            // - is open
            // - and is less than a minute old
            if (
                connection?.stat?.status === 'OPEN' &&
                connection.stat?.timeline.open > Date.now() - 60 * 1000
            ) {
                // this is a newly opened connection
                // instead of creating a second one
                // just return the connection we just made
                return this.serverConnection;
            }
            // else, this connection may have failed, be closed,
            // or be old (could have failed more exotically)
            // we should discard it and create a new connection
        }

        // first, close any open connections to our server
        this.log.debug('Closing existing server connections...');
        await this.node.hangUp(this.serverPeer);

        // at some point, addresses for our peer can get removed
        // re-add everything from our bootstrap list before
        // trying to connect again
        this.log.debug('Re-adding server peer addresses');
        this.node.peerStore.addressBook.add(
            this.serverPeer,
            this.bootstrapList.all().map(it => it.multiaddr)
        );

        // now, attempt to dial our server
        this.log.info('Dialing server...');
        this.serverConnection = this.node
            .dial(this.serverPeer)
            .catch(async e => {
                // we weren't able to dial
                this.log.error('Error dialing server: ', e);
                this.log.debug('Retrying dial in: ', retryTimeout);
                this.serverConnection = undefined;
                // wait before retrying
                await waitFor(retryTimeout);
                // refresh our stats so that the dial gets an updated order
                await this.bootstrapList.refreshStats();
                // retry
                this.log.info('Redialing server...');
                return this.connectToServer(
                    retryTimeout > 30000 ? retryTimeout : retryTimeout + 1000
                );
            });

        // return our connection
        return this.serverConnection;
    }

    public async start() {
        // load our bootstrap list
        await this.bootstrapList.load();

        // update status
        this.connectionStatus = ServerPeerStatus.BOOTSTRAPPED;

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
                // current version of libp2p will still autodial unless
                // explicitly disabled (removed in later version)
                autoDial: false,
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

        // track discovered peers
        const discoveredPeers = new Set<string>();
        this.node.addEventListener('peer:discovery', evt => {
            // if this is a new peer that we've just discovered
            // (as opposed to an existing peer that we *haven't* discovered,
            // but libp2p is dispatching a discovery event for anyway,
            // because that makes sense)
            const peerId = evt.detail.id.toString();
            if (!discoveredPeers.has(peerId)) {
                // we've discovered it
                discoveredPeers.add(peerId);
                this.log.info(`Discovered peer ${peerId.toString()}`);
                // if this is our server peer
                if (this.bootstrapList.serverId === peerId) {
                    this.serverPeer = evt.detail.id;
                    // connect to our server (autodial is disabled)
                    this.connectToServer();
                }
            }
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
                    }

                    // else, we've connected to our server
                    this.log.info('Connected to server.');

                    if (!this.serverConnection) {
                        this.serverConnection = Promise.resolve(connection);
                    }
                    this.streamFactory = new StreamFactory(
                        this.DIAL_TIMEOUT,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.serverPeer!,
                        this
                    );

                    // update status
                    this.connectionStatus = ServerPeerStatus.CONNECTED;

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
                this.log.warn('Disconnected from server.');
                this.serverConnection = undefined;
                // update status
                this.connectionStatus = ServerPeerStatus.CONNECTING;
                this.dispatchEvent('disconnected');
                this.connectToServer();
            }
        });

        // time to start up our node
        this.log.debug('Starting libp2p...');
        await this.node.start();
        this.log.info('Started libp2p.');

        // update status
        this.connectionStatus = ServerPeerStatus.CONNECTING;
        waitFor(30000).then(() => {
            if (this.connectionStatus === ServerPeerStatus.CONNECTING) {
                this.connectionStatus = ServerPeerStatus.OFFLINE;
            }
        });
    }

    public async getProxyStream() {
        if (!this.streamFactory) {
            throw new Error('Stream factory not initialized');
        }
        return this.streamFactory.getProxyStream();
    }

    releaseProxyStream(stream: WrappedStream) {
        this.streamFactory?.releaseProxyStream(stream);
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
