import { Bootstrap } from '@libp2p/bootstrap';
import { MultiaddrConnection } from '@libp2p/interface-connection';
import type { Address } from '@libp2p/interface-peer-store';
import { Upgrader } from '@libp2p/interface-transport';
import { peerIdFromString } from '@libp2p/peer-id';
import { WebSockets } from '@libp2p/websockets';
import { P2P } from '@multiformats/mafmt';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { Buffer } from 'buffer';
import { pipe } from 'it-pipe';
import localforage from 'localforage';

import type { P2pClient } from '.';
import { logger } from '../logging';
import { nativeFetch } from '../p2p-fetch/override-fetch';
import status from '../status';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

class BootstrapAddress {
    public multiaddr: Multiaddr;
    public lastSeen = 0;
    public latency = Infinity;
    public serverId: string;
    public isRelay = false;
    public isDNS = false;

    public constructor(public readonly address: string) {
        if (!P2P.matches(address)) {
            throw new Error('Invalid multiaddr');
        }

        this.multiaddr = multiaddr(address);
        const serverId = this.multiaddr.getPeerId();
        if (!serverId) {
            throw new Error(
                `Address ${address} contains invalid or missing peer id.`
            );
        }

        this.serverId = serverId;
        this.isRelay = this.address.includes('/p2p-circuit/');
        this.isDNS = this.address.includes('/dns4/');
    }

    static fromJson(json: Record<string, unknown>): BootstrapAddress {
        const addr = new BootstrapAddress(json.address as string);
        addr.lastSeen = json.lastSeen as number;
        addr.latency = json.latency as number;
        return addr;
    }

    toJson(): Record<string, unknown> {
        return {
            address: this.address,
            lastSeen: this.lastSeen,
            latency: this.latency,
        };
    }

    toString(): string {
        return this.multiaddr.toString();
    }
}

export class BootstrapList extends Bootstrap {
    private log = logger.getLogger('worker/p2p/bootstrap');

    private maxOffline = 7 * 24 * 60 * 60 * 1000;
    private statsTimeout = 10000;

    private addresses: Record<string, BootstrapAddress> = {};
    private _serverId?: string;

    constructor(private client: P2pClient) {
        // initialize bootstrap discovery with dummy list
        super({ list: ['/ip4/1.2.3.4/tcp/1234/tls/p2p/QmFoo'] });
        // open the relay stream to receive new relay addresses
        let relayDebounce = 0;
        client.addEventListener('connected', () => {
            if (Date.now() - relayDebounce > 60000) {
                relayDebounce = Date.now();
                this.openRelayStream();
            }
        });
    }

    private async populateStats(address: BootstrapAddress) {
        // timeout after configured timeout
        const abortController = new AbortController();
        const signal = abortController.signal;
        waitFor(this.statsTimeout).then(() => abortController.abort());
        // send websocket request, track time
        const start = Date.now();
        let socket;
        try {
            socket = await new WebSockets().dial(
                address.isRelay
                    ? address.multiaddr.decapsulate('p2p-circuit')
                    : address.multiaddr,
                {
                    signal,
                    upgrader: {
                        upgradeOutbound: async (socket: MultiaddrConnection) =>
                            socket,
                    } as unknown as Upgrader,
                }
            );
            address.latency = Date.now() - start;
            address.lastSeen = Date.now();
        } catch (e) {
            this.log.debug(`Failed to connect to ${address}: `, e);
            address.latency = Infinity;
        }
        // close the socket
        try {
            if (socket) {
                await socket.close();
            }
        } catch (e) {
            this.log.warn(`Failed to close socket to ${address}: `, e);
        }
        // we've finished collecting stats
        this.log.trace(
            'Latency for address: ',
            address.address,
            address.latency
        );
    }

    private isRecent(address: BootstrapAddress) {
        return address.lastSeen > Date.now() - this.maxOffline;
    }

    private async addAddress(addressToAdd: string | BootstrapAddress) {
        if (!addressToAdd) {
            this.log.trace(`Ignoring falsy address: ${addressToAdd}`);
            return null;
        }

        // ensure this is a valid bootstrap address object
        let address;
        try {
            address =
                typeof addressToAdd === 'string'
                    ? new BootstrapAddress(addressToAdd)
                    : addressToAdd;
        } catch (e) {
            this.log.debug(`Ignoring invalid address: ${addressToAdd} (${e})`);
            return null;
        }

        // ensure this is a new address
        if (this.addresses[address.address]) {
            this.log.trace(`Declining to add existing address: ${address}`);
            return null;
        }

        // ensure it matches our current server id
        if (this._serverId && address.serverId !== this._serverId) {
            this.log.debug(
                `Declining to add address with different server id: ${address}`
            );
            return null;
        }

        // get stats for this address
        await this.populateStats(address);
        // ensure this address is recent
        if (!this.isRecent(address)) {
            this.log.debug(`Declining to add stale address: ${address}`);
            return null;
        }

        // by this point, we know this is a valid and active address
        // add this address to our list
        this.log.trace(`Adding address: ${address}`);
        this.addresses[address.address] = address;
        return address;
    }

    private async removeAddress(address: BootstrapAddress) {
        this.log.trace(`Removing address: ${address}`);
        delete this.addresses[address.address];
    }

    private async loadCache() {
        // load our cached bootstrap list
        const cached = await localforage.getItem<string>('p2p:bootstrap-list');
        if (!cached) {
            // no more to do
            return;
        } // else we have a cached list
        const cacheList = JSON.parse(cached) as Record<string, unknown>[];
        this.log.debug('Loaded cached bootstrap list: ', cacheList);
        // parse the cached list
        await Promise.all(
            cacheList.map((address: Record<string, unknown>) =>
                this.addAddress(BootstrapAddress.fromJson(address))
            )
        );
    }

    private async dumpCache() {
        // dump our bootstrap list to cache
        return localforage.setItem(
            'p2p:bootstrap-list',
            JSON.stringify(
                Object.values(this.addresses).map(address => address.toJson())
            )
        );
    }

    private async openRelayStream() {
        // open stream to relay protocol
        const stream = await this.client.getStream('/samizdapp-relay');
        this.log.trace('Got relay stream: ', stream);

        // receive messages from relay protocol
        await pipe(stream.source, async source => {
            for await (const msg of source) {
                // this message is an address
                const addressString = Buffer.from(msg.subarray()).toString();
                this.log.debug(
                    `Received relay address from stream: ${addressString}`
                );
                // add it to our list
                const addedAddress = await this.addAddress(addressString);
                // if NOT successfully added
                if (!addedAddress) {
                    // nothing more to do
                    continue;
                }
                // else, we just added a new address
                this.log.info(`Got new relay address: ${addedAddress}`);
                // update our cache
                await this.dumpCache();
                // add this new address to the client
                this.client.addServerPeerAddress(addedAddress.multiaddr);
                // update status
                status.relays.push(addedAddress.address);
            }
        }).catch(e => {
            this.log.warn('Error in pipe: ', e);
        });
        // we wan't fetch streams to have priority, so let's ease up this loop
        await new Promise(r => setTimeout(r, 20000));
    }

    public async refreshStats() {
        // refresh the stats for all addresses
        await Promise.all(
            Object.values(this.addresses).map(async address => {
                await this.populateStats(address);
                // if this address is stale, remove it
                if (!this.isRecent(address)) {
                    this.log.debug(`Removing stale address: ${address}`);
                    await this.removeAddress(address);
                }
            })
        );
    }

    public async load() {
        // start by loading our cached bootstrap list
        await this.loadCache();

        // next, check for a new bootstrap address
        let newBootstrapAddress = null;
        try {
            newBootstrapAddress = await nativeFetch(
                '/smz/pwa/assets/libp2p.bootstrap'
            )
                .then(res => {
                    if (res.status >= 400) {
                        throw res;
                    }
                    return res.text();
                })
                .then(text => text.trim());
        } catch (e) {
            this.log.warn(
                'Error while trying to fetch new bootstrap address: ',
                e
            );
        }
        // if we received a new bootstrap address, add it to our list
        const addedBootstrap = await this.addAddress(newBootstrapAddress ?? '');
        // if it was added successfully
        if (addedBootstrap) {
            // our new bootstrap address was successfully added
            this.log.info(
                `Found updated bootstrap address, updating bootstrap list: ${addedBootstrap}`
            );

            // construct a /dns4 address from our new bootstrap address
            const { hostname } = new URL(self.origin);
            const [_, _proto, _ip, ...rest] = addedBootstrap.address.split('/');
            const withDns = `/dns4/${hostname}/${rest.join('/')}`;
            // add it to our list
            this.log.debug('Adding /dns4 address: ', withDns);
            await this.addAddress(withDns);

            // construct a local /dns4 address
            const withLocalDns = `/dns4/${hostname.replace(
                /localhost$/,
                'local'
            )}/${rest.join('/')}`;
            // add it to our list
            this.log.debug('Adding /dns4 local address: ', withLocalDns);
            await this.addAddress(withLocalDns);
        }

        // refresh stats
        await this.refreshStats();

        // log list
        const addressList = this.addressList.map(it => it.address);
        this.log.info('Loaded bootstrap addresses: ', addressList);
        status.relays.push(...addressList);

        // update our cache
        await this.dumpCache();

        // if we have no addresses
        if (!Object.keys(this.addresses).length) {
            // this isn't good
            this.log.error(
                'No addresses loaded into bootstrap list, client will fail.'
            );
            return;
        }

        // create a bootstrap discovery list grouped by peer
        const addressesByPeer: Record<string, BootstrapAddress[]> = {};
        Object.values(this.addresses).forEach(address => {
            if (!addressesByPeer[address.serverId]) {
                addressesByPeer[address.serverId] = [];
            }
            addressesByPeer[address.serverId].push(address);
        });
        // override our current bootstrap discovery list
        Object.defineProperty(this, 'list', {
            configurable: true,
            value: Object.entries(addressesByPeer).map(
                ([peerId, addresses]) => ({
                    id: peerIdFromString(peerId),
                    multiaddrs: addresses.map(address => address.multiaddr),
                    protocols: [],
                })
            ),
        });

        // get our server id
        this._serverId = Object.values(this.addresses)[0]?.serverId;
    }

    public get serverId() {
        if (!this._serverId) {
            throw new Error('Attempt to access serverId before it is set.');
        }
        return this._serverId;
    }

    private addressSorter(a: BootstrapAddress, b: BootstrapAddress) {
        this.log.trace(`Sorting: ${a} <=> ${b}`);

        // if we don't have stats for an address, prefer the one we have stats for
        if (!a && !b) {
            return 0;
        }
        if (!a) {
            return 1;
        }
        if (!b) {
            return -1;
        }

        // we have stats for both, prefer the one we've been able to connect to
        if (a.latency === Infinity && b.latency !== Infinity) {
            return 1;
        }
        if (a.latency !== Infinity && b.latency === Infinity) {
            return -1;
        }

        // we've been able to connect to both/neither, prefer a non relay
        if (a.isRelay && !b.isRelay) {
            return 1;
        }
        if (!a.isRelay && b.isRelay) {
            return -1;
        }

        // both/neither are relays, prefer the one with lower latency
        return a.latency - b.latency;
    }

    public libp2pAddressSorter(a: Address, b: Address) {
        // first of all, get our addresses
        const addressA = this.addresses[a.multiaddr.toString()];
        const addressB = this.addresses[b.multiaddr.toString()];
        return this.addressSorter(addressA, addressB);
    }

    public all() {
        return Object.values(this.addresses);
    }

    public get addressList() {
        return Object.values(this.addresses).sort((a, b) =>
            this.addressSorter(a, b)
        );
    }
}
