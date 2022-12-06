import { Bootstrap } from '@libp2p/bootstrap';
import { MultiaddrConnection } from '@libp2p/interface-connection';
import type { Address } from '@libp2p/interface-peer-store';
import { Upgrader } from '@libp2p/interface-transport';
import { peerIdFromString } from '@libp2p/peer-id';
import { WebSockets } from '@libp2p/websockets';
import { P2P } from '@multiformats/mafmt';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import localforage from 'localforage';

import type { P2pClient } from '.';
import { logger } from '../logging';
import { nativeFetch } from '../p2p-fetch';
import status from '../status';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

class BootstrapAddress {
    public multiaddr: Multiaddr;
    public lastSeen = 0;
    public latency = Infinity;
    public isRelay = false;
    public isDNS = false;
    public address: string;

    private _serverId: string;

    public constructor(address: string) {
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

        this.address = this.multiaddr.toString();
        this._serverId = serverId;
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
            address: this.address ?? '',
            lastSeen: this.lastSeen ?? Date.now(),
            latency: this.latency ?? Infinity,
        };
    }

    toString(): string {
        return this.address;
    }

    get serverId(): string {
        return this._serverId;
    }

    set serverId(id: string) {
        // update multiaddr
        const newMultiaddr = multiaddr(
            this.multiaddr.toString().replace(this._serverId, id)
        );
        const newServerId = newMultiaddr.getPeerId();
        if (!newServerId) {
            throw new Error(
                `Error setting serverId: ${id} (was parsed to: ${newServerId}).`
            );
        }
        this.address = newMultiaddr.toString();
        this.multiaddr = newMultiaddr;
        this._serverId = newServerId;
    }
}

export class BootstrapList extends Bootstrap {
    private log = logger.getLogger('worker/p2p/bootstrap');

    private maxOffline = 7 * 24 * 60 * 60 * 1000;
    private defaultStatsTimeout = 10000;

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

    private async populateStats(
        address: BootstrapAddress,
        timeout = this.defaultStatsTimeout
    ) {
        // timeout after configured timeout
        const abortController = new AbortController();
        const signal = abortController.signal;
        waitFor(timeout).then(() => abortController.abort());
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

    private async addAddress(
        addressToAdd: string | BootstrapAddress,
        { overrideServerId = false, statsTimeout = 0 } = {}
    ) {
        if (!addressToAdd) {
            this.log.trace(`Ignoring falsy address: ${addressToAdd}`);
            return null;
        }

        // ensure this is a valid bootstrap address object
        let address: BootstrapAddress;
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
        // optionally, override our existing server id by letting
        // this address through if it doesn't match
        if (
            this._serverId &&
            address.serverId !== this._serverId &&
            !overrideServerId
        ) {
            this.log.debug(
                `Declining to add address with different server id: ${address}`
            );
            return null;
        }

        // get stats for this address
        await this.populateStats(
            address,
            // set a timeout of twice our quickest latency
            // (if we already have an address, it isn't super important that we
            // give this extra address time)
            statsTimeout || Math.min(this.addressList[0]?.latency * 2 || 1000)
        );
        // ensure this address is recent
        if (!this.isRecent(address)) {
            this.log.debug(`Declining to add stale address: ${address}`);
            return null;
        }

        // by this point, we know this is a valid and active address

        // if we don't have a server id yet,
        // or if we're supposed to override our server id
        if (
            !this._serverId ||
            (overrideServerId && address.serverId !== this._serverId)
        ) {
            // log a warning if we're going to override our server id
            if (this._serverId) {
                this.log.warn(
                    `Overriding server id ${this._serverId} with ${address.serverId}`
                );
            }
            // now, set our server id to the server id of this address
            this._serverId = address.serverId;
            // now, update all of our existing addresses with the new server id
            this.addresses = Object.fromEntries(
                Object.values(this.addresses).map(existingAddress => {
                    existingAddress.serverId = address.serverId;
                    return [existingAddress.address, existingAddress];
                })
            );
        }

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
        for (const address of cacheList) {
            let parsedAddress: string | BootstrapAddress = '';
            try {
                parsedAddress = BootstrapAddress.fromJson(address);
            } catch (e) {
                this.log.warn('Invalid address in cache: ', address, e);
            }
            await this.addAddress(parsedAddress);
        }
    }

    private async dumpCache() {
        // don't dump if the list is empty
        if (!Object.keys(this.addresses).length) {
            this.log.error('Declining to cache empty bootstrap list.');
            return;
        }
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

        let buffer = null;

        // receive messages from relay protocol
        while ((buffer = await stream.read()) !== null) {
            // this message is an address
            const addressString = buffer.toString();

            this.log.debug(
                `Received relay address from stream: ${addressString}`
            );
            // add it to our list
            const addedAddress = await this.addAddress(addressString, {
                statsTimeout: this.defaultStatsTimeout,
            });
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
        // use it to override our server id (this allows us to get the new
        // server id from our box)
        const addedBootstrap = await this.addAddress(
            newBootstrapAddress ?? '',
            { overrideServerId: true, statsTimeout: 3000 }
        );
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

        // now that we've added all of our addresses,
        // give our slower addresses another chance to be seen using the
        // default timeout, but don't wait for them
        this.refreshStats();

        // log list
        const addressList = this.addressList.map(it => it.address);
        this.log.info('Loaded bootstrap addresses: ', addressList);
        status.relays.push(...addressList);

        // if we have no addresses
        if (!Object.keys(this.addresses).length) {
            // this isn't good
            this.log.error(
                'No addresses loaded into bootstrap list, client will fail.'
            );
            return;
        }

        // update our cache
        await this.dumpCache();

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
