import { Noise } from '@athena/shared/libp2p/@chainsafe/libp2p-noise';
import { Mplex } from '@athena/shared/libp2p/@libp2p/mplex';
import { WebSockets } from '@athena/shared/libp2p/@libp2p/websockets';
import { Multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';
import { createLibp2p, Libp2p } from '@athena/shared/libp2p/libp2p';
import { Connection } from '@libp2p/interface-connection';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import type { Address } from '@libp2p/interface-peer-store';
import { KEEP_ALIVE } from '@libp2p/interface-peer-store/tags';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import { AbortOptions } from '@libp2p/interfaces';
import { all as filtersAll } from '@libp2p/websockets/filters';
import { DefaultConnectionManager } from 'libp2p/connection-manager';
import { DefaultDialer } from 'libp2p/connection-manager/dialer';
import { Libp2pNode } from 'libp2p/libp2p';

import { ClientMessageType, ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import messenger from '../messenger';
import status from '../status';
import { BootstrapList } from './bootstrap-list';
import { initLibp2pLogging } from './libp2p-logging';
import { PingService } from './ping-service';
import { StreamFactory } from './stream-factory';
import { HeartbeatStream } from './streams';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

const withTimeout = async <T, E = void>(
    action: () => Promise<T>,
    timeout = 1000,
    onTimeout?: () => Promise<E>
): Promise<T | E> => {
    return Promise.race([
        action(),
        waitFor(timeout).then(() => {
            throw new Error('E_TIMEOUT');
        }) as Promise<E>,
    ]).catch(async (e): Promise<E> => {
        if ((e as Error).message !== 'E_TIMEOUT') {
            throw e;
        }
        return onTimeout?.() as unknown as E;
    });
};

export class P2pClient {
    private log = logger.getLogger('worker/p2p/client');

    private DIAL_TIMEOUT = 3000;
    private MAX_PARALLEL_DIALS = 20;
    private MAX_DIALS_PER_PEER = 20;

    private streamFactory?: StreamFactory;
    private bootstrapList: BootstrapList;
    private pingService: PingService;
    private eventTarget = new EventTarget();

    private serverPeer?: PeerId;
    private _heartbeat?: HeartbeatStream;
    public node?: Libp2p;
    private _connectionStatus: ServerPeerStatus = ServerPeerStatus.OFFLINE;

    public constructor() {
        this.bootstrapList = new BootstrapList(this, this.MAX_DIALS_PER_PEER);
        this.pingService = new PingService(this);
    }

    public get connectionStatus(): ServerPeerStatus {
        return this._connectionStatus;
    }

    public set connectionStatus(connectionStatus: ServerPeerStatus) {
        this._connectionStatus = connectionStatus;
        status.serverPeer = connectionStatus;
    }

    public async addServerPeerAddress(multiaddr: Multiaddr) {
        if (!this.serverPeer) {
            throw new Error('No server peer discovered.');
        }

        await this.node?.peerStore.addressBook
            .add(this.serverPeer, [multiaddr])
            .catch(_ => _);
    }

    public getStream(protocol = '/samizdapp-proxy/3.0.0') {
        if (!this.streamFactory) {
            throw new Error('No connection established!');
        }

        return this.streamFactory.getStream(protocol);
    }

    public async performDialAction<T>(
        action: (signal: AbortSignal) => Promise<T>,
        timeout = this.DIAL_TIMEOUT
    ) {
        const abortController = new AbortController();
        const signal = abortController.signal;
        waitFor(timeout).then(() => abortController.abort());
        return withTimeout(
            () => action(signal),
            timeout + 1000,
            () => {
                throw new Error(
                    'Abort controller failed to abort within 1 second past timeout.'
                );
            }
        ) as Promise<T>;
    }

    private setDisconnectedStatus() {
        // if our status has already been set
        if (this.connectionStatus !== ServerPeerStatus.CONNECTED) {
            // then we don't need to set it again
            return;
        }

        // update status
        this.connectionStatus = ServerPeerStatus.CONNECTING;
        this.dispatchEvent('disconnected');
    }

    private async connectToServer(retryTimeout = 1000): Promise<void> {
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

        // first, close any open connections to our server
        this.setDisconnectedStatus();
        this.log.debug('Closing existing server connections...');
        await withTimeout(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            () => this.node!.hangUp(this.serverPeer!),
            7000,
            async () => {
                this.log.warn(
                    'Timeout while closing existing server connections, manually setting disconnect state.'
                );
                // manually set the disconnect state on our connection manager
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const connectionManager = this.node!
                    .connectionManager as DefaultConnectionManager;
                const connections =
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    connectionManager.getConnections(this.serverPeer!) ?? [];
                connections.forEach(connection => {
                    connectionManager.onDisconnect(
                        new CustomEvent<Connection>('connectionEnd', {
                            detail: connection,
                        })
                    );
                });
            }
        );
        // clear away any pending dials
        // (it is possible for pending dials to hang indefinitely)
        const dialer = (
            this.node as Libp2pNode
        ).components.getDialer() as DefaultDialer;
        await dialer.stop();
        dialer.tokens = [...Array(this.MAX_PARALLEL_DIALS).keys()];
        await dialer.start();

        // at some point, addresses for our peer can get removed
        // re-add everything from our bootstrap list before
        // trying to connect again
        this.log.debug('Re-adding server peer addresses');
        this.node.peerStore.addressBook.add(
            this.serverPeer,
            this.bootstrapList.multiaddrList
        );

        // now, attempt to dial our server
        this.log.info('Dialing server...');
        try {
            const connection = await this.performDialAction(
                signal =>
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.node!.dial(this.serverPeer!, {
                        signal,
                    }),
                retryTimeout * 2
            );
            this.log.debug(
                'Successfully dialed: ',
                connection.remoteAddr.toString()
            );
        } catch (e) {
            // we weren't able to dial
            this.log.error('Error dialing server: ', e);
            this.log.debug('Retrying dial in: ', retryTimeout);
            // wait before retrying
            await waitFor(retryTimeout);
            // ensure that we didn't become connected during our timeout
            if (this.connectionStatus === ServerPeerStatus.CONNECTED) {
                this.log.debug(
                    'Connection established during timeout, aborting retry.'
                );
                return;
            }
            // refresh our stats so that the dial gets an updated order
            await this.bootstrapList.refreshStats();
            // retry
            this.log.info('Redialing server...');
            return this.connectToServer(
                retryTimeout > 30000 ? 1000 : retryTimeout + 1000
            );
        }
    }

    private async loopConnectionStatus(failedAttempts = 0) {
        const loopInterval = 5000;
        // keep our connection status in sync
        if (
            (!this.node || !this.serverPeer) &&
            this.connectionStatus === ServerPeerStatus.CONNECTED
        ) {
            this.connectionStatus = ServerPeerStatus.CONNECTING;
        }
        // if we're not connected
        if (this.connectionStatus !== ServerPeerStatus.CONNECTED) {
            // then there is nothing to loop
            this.log.trace(
                'Skipping connection status loop. Status: ',
                this.connectionStatus
            );
            await waitFor(loopInterval);
            this.loopConnectionStatus();
            return;
        }

        // else, we want to make sure our connection is still good
        // if we've had failed attempts, then wait a bit
        await waitFor(failedAttempts * 1000);
        try {
            // now, ping our server
            this.log.trace('Pinging server: ', this.serverPeer?.toString());
            // timeout configurable via `init.ping.timeout`,
            // default is 10 seconds
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await this.ping(this.serverPeer!);
            // if our ping was successful, then our connection is still good
            this.log.trace('Ping successful!');
        } catch (e) {
            // if we haven't failed two times yet
            if (++failedAttempts < 2) {
                // then try again
                this.log.debug(
                    `Ping failed, retrying (failed attempts: ${failedAttempts}): ${e}`
                );
                this.loopConnectionStatus(failedAttempts);
                return;
            }
            // else, we've tried enough, we've lost our connection
            this.log.warn('Server connection lost (error pinging server): ', e);
            this.setDisconnectedStatus();
            // try to reconnect
            this.connectToServer();
        }

        // we've reached the end our our loop
        await waitFor(loopInterval);
        this.loopConnectionStatus();
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
                maxDialsPerPeer: this.MAX_DIALS_PER_PEER,
                maxParallelDials: this.MAX_PARALLEL_DIALS,
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
                    // if we're not connected
                    if (this.connectionStatus !== ServerPeerStatus.CONNECTED) {
                        // connect to our server (autodial is disabled)
                        this.connectToServer();
                    }
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
                    this.log.info('Gained connection to server.');

                    // if we were already connected
                    if (this.connectionStatus === ServerPeerStatus.CONNECTED) {
                        // then there is no more to do
                        return;
                    }

                    // update status
                    this.connectionStatus = ServerPeerStatus.CONNECTED;

                    this.streamFactory = new StreamFactory(
                        this.DIAL_TIMEOUT,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.serverPeer!,
                        this
                    );

                    // set keep-alive on connection
                    try {
                        await this.node?.peerStore
                            .tagPeer(connection.remotePeer, KEEP_ALIVE)
                            .catch(_ => null);

                        this._heartbeat =
                            await this.streamFactory.getHeartbeatStream();
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
            this.log.info('Disconnected from: ', {
                server: connection.remotePeer.toString(),
                via: connection.remoteAddr.toString(),
            });
            if (
                this.connectionStatus === ServerPeerStatus.CONNECTED &&
                connection.remotePeer.equals(this.serverPeer ?? '')
            ) {
                this.log.warn('Lost connection from server.');
            }
        });

        // time to start up our node
        this.log.debug('Starting libp2p...');
        await this.node.start();
        this.log.info('Started libp2p.');
        // start our connection status loop
        this.loopConnectionStatus();

        this.handleWebsocketMessages();

        // update status
        this.connectionStatus = ServerPeerStatus.CONNECTING;
        waitFor(30000).then(() => {
            if (this.connectionStatus === ServerPeerStatus.CONNECTING) {
                this.connectionStatus = ServerPeerStatus.OFFLINE;
            }
        });
    }

    public async ping(
        peer: Multiaddr | PeerId,
        options?: AbortOptions
    ): Promise<number> {
        return this.pingService.ping(peer, options);
    }

    private async handleWebsocketMessages() {
        // listen for websocket messages
        this.log.debug('Listening for websocket messages...');
        messenger.addNativeHandler(event => {
            this.log.debug('Received websocket message:', event);
            if (event.data.type === ClientMessageType.WEBSOCKET) {
                this.log.info('creating websocket stream...');
                this.streamFactory?.getWebsocketStream(
                    event.ports as MessagePort[]
                );
            }
        });
    }

    public async getRequestStream() {
        if (!this.streamFactory) {
            throw new Error('Stream factory not initialized');
        }
        return this.streamFactory.getNativeRequestStream();
    }

    public async getNativeRequestStream() {
        if (!this.streamFactory) {
            throw new Error('Stream factory not initialized');
        }
        return this.streamFactory.getNativeRequestStream();
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
