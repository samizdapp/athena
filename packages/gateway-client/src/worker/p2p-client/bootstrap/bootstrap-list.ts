import { Bootstrap } from '@libp2p/bootstrap';
import type { Address } from '@libp2p/interface-peer-store';
import { peerIdFromString } from '@libp2p/peer-id';
import localforage from 'localforage';
import { ServerPeerStatus } from 'packages/gateway-client/src/worker-messaging';

import type { P2pClient } from '..';
import environment from '../../../environment';
import { logger } from '../../logging';
import { nativeFetch } from '../../p2p-fetch';
import status from '../../status';
import { BootstrapAddress } from './bootstrap-address';
import { pingStats, websocketStats } from './stats-transports';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

export class BootstrapList extends Bootstrap {
    private log = logger.getLogger('worker/p2p/bootstrap/list');

    private maxOffline = 7 * 24 * 60 * 60 * 1000;
    private defaultStatsTimeout = 10000;

    private addresses: Record<string, BootstrapAddress> = {};
    private _serverId?: string;

    constructor(public client: P2pClient, private limit = 10) {
        // initialize bootstrap discovery with dummy list
        super({ list: ['/ip4/1.2.3.4/tcp/1234/tls/p2p/QmFoo'] });
        // open the relay stream to receive new relay addresses
        let relayDebounce = 0;
        let statsRefreshed = false;
        client.addEventListener('connected', () => {
            if (Date.now() - relayDebounce > 60000) {
                relayDebounce = Date.now();
                this.openRelayStream();
            }

            // Refresh our stats an additional time.
            // This does two things: 1) It gives our slower addresses another
            // chance to be seen using the default timeout. 2) It allows
            // populateStats() to use the ping() method to validate our
            // addresses, which will also validate our peer id.
            if (!statsRefreshed) {
                this.refreshStats().then(() => {
                    // update our cache
                    this.dumpCache();
                    statsRefreshed = true;
                });
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
        // get our latency using a transport method
        let latency;
        // if we have a connection
        if (
            this.client.node &&
            this.client.connectionStatus === ServerPeerStatus.CONNECTED
        ) {
            // use ping
            latency = await pingStats(this, address, signal);
        }
        // else, use websockets
        else {
            latency = await websocketStats(this, address, signal);
        }
        // update our address with our latency
        address.latency = latency;
        if (latency !== Infinity) {
            address.lastSeen = Date.now();
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
                // for (const address of Object.values(this.addresses)) {
                await this.populateStats(address);
                // if this address is stale, remove it
                if (!this.isRecent(address)) {
                    this.log.debug(`Removing stale address: ${address}`);
                    await this.removeAddress(address);
                }
                // }
            })
        );
    }

    public async load() {
        // start by loading our cached bootstrap list
        await this.loadCache();

        // next, check for new addresses from our box
        let localMultiaddr = null;
        let publicMultiaddr = null;
        try {
            const p2pInfo = await nativeFetch(
                `${environment.NETWORKING_API_ROOT}/info/p2p`
            ).then(res => {
                if (res.status >= 400) {
                    throw res;
                }
                return res.json();
            });
            ({ localMultiaddr, publicMultiaddr } = p2pInfo.info);
        } catch (e) {
            this.log.warn('Error while trying to fetch new p2p addresses: ', e);
        }

        // if we received a new local address, add it to our list
        // use it to override our server id (this allows us to get the new
        // server id from our box)
        const addedLocal = await this.addAddress(localMultiaddr ?? '', {
            overrideServerId: true,
            statsTimeout: 3000,
        });
        // if it was added successfully
        if (addedLocal) {
            // our new bootstrap address was successfully added
            this.log.info(`Fetched updated local address: ${addedLocal}`);

            // construct a /dns4 address from our new bootstrap address
            const { hostname } = new URL(self.origin);
            const [_, _proto, _ip, ...rest] = addedLocal.address.split('/');
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

        // added our public address, if we received one
        const addedPublic = await this.addAddress(publicMultiaddr ?? '');
        if (addedPublic) {
            this.log.info(`Fetched updated public address: ${addedPublic}`);
        }

        // log list
        const addressList = this.addressList.map(it => it.address);
        this.log.info('Loaded bootstrap addresses: ', addressList);
        status.relays.push(...addressList);

        // if we have no addresses
        if (!Object.keys(this.addresses).length || !this._serverId) {
            // this isn't good
            this.log.error(
                'No addresses loaded into bootstrap list, client will fail.'
            );
            return;
        }

        // update our cache
        await this.dumpCache();

        // override our current bootstrap discovery list
        Object.defineProperty(this, 'list', {
            configurable: true,
            value: [
                {
                    id: peerIdFromString(this._serverId),
                    multiaddrs: this.multiaddrList,
                    protocols: [],
                },
            ],
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
        return Object.values(this.addresses)
            .sort((a, b) => this.addressSorter(a, b))
            .slice(0, this.limit);
    }

    public get multiaddrList() {
        return this.addressList.map(it => it.multiaddr);
    }
}
