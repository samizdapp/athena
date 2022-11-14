import { Noise } from '@chainsafe/libp2p-noise';
import { Bootstrap } from '@libp2p/bootstrap';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { PeerId } from '@libp2p/interface-peer-id';
import type { Address } from '@libp2p/interface-peer-store';
import { KEEP_ALIVE } from '@libp2p/interface-peer-store/tags';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import { Mplex } from '@libp2p/mplex';
import { WebSockets } from '@libp2p/websockets';
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
    private log = logger.getLogger('worker/p2p-client');

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
        const bootstraplist = await this.bootstrapList.initCheckAddresses(
            await this.bootstrapList.getBootstrapList()
        );
        this.log.info('Bootstrap list: ', bootstraplist);
        // await initCheckAddresses(bootstraplist);
        // update status
        status.serverPeer = ServerPeerStatus.BOOTSTRAPPED;

        status.relays.push(...bootstraplist.slice(2));

        // const datastore = new LevelDatastore('./libp2p');
        // await datastore.open(); // level database must be ready before node boot
        const serverID = bootstraplist[0].split('/').pop();
        this.node = await createLibp2p({
            // datastore,
            transports: [
                new WebSockets({
                    filter: (...args) =>
                        this.bootstrapList.websocketAddressFilter(...args),
                }),
            ],
            connectionEncryption: [
                new Noise() as unknown as ConnectionEncrypter,
            ],
            streamMuxers: [new Mplex() as StreamMuxerFactory],
            peerDiscovery: [
                new Bootstrap({
                    list: bootstraplist, // provide array of multiaddrs
                }),
            ],
            connectionManager: {
                autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minConnections)
                minConnections: 3,
                maxDialsPerPeer: 20,
                maxParallelDials: 20,
                addressSorter: (a: Address, b: Address) =>
                    this.bootstrapList.publicRelayAddressesFirst(a, b),
                // The `tag` property will be searched when creating the instance of your Peer Discovery service.
                // The associated object, will be passed to the service when it is instantiated.
                // dialTimeout: self.DIAL_TIMEOUT,
                // maxParallelDials: 25,
                // maxAddrsToDial: 25,
                // resolvers: {
                //     dnsaddr: dnsaddrResolver,
                //     // ,
                //     // host: hostResolver
                // },
            },
            relay: {
                // Circuit Relay options (this config is part of libp2p core configurations)
                enabled: true, // Allows you to dial and accept relayed connections. Does not make you a relay.
                autoRelay: {
                    enabled: true, // Allows you to bind to relays with HOP enabled for improving node dialability
                    maxListeners: 5, // Configure maximum number of HOP relays to use
                },
            },
        });

        initLibp2pLogging();

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
                    const serverMatch = str_id === serverID;
                    this.log.info(
                        `Server match: ${serverMatch} (${str_id} ${
                            serverMatch ? '=' : '!'
                        }== ${serverID})`
                    );
                    if (!serverMatch) {
                        // then there is no more to do
                        return;
                    } // else, we've connected to our server

                    this.serverPeer = connection.remotePeer;
                    this.streamFactory = new StreamFactory(
                        this.DIAL_TIMEOUT,
                        this.serverPeer,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this,
                        this.bootstrapList
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

        const path = this.bootstrapList.getQuickestPath();
        if (path) {
            this.node.dial(path as unknown as MultiaddrType);
        }

        waitFor(15000).then(() => {
            if (status.serverPeer === ServerPeerStatus.CONNECTING) {
                status.serverPeer = ServerPeerStatus.OFFLINE;
            }
        });
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
