import type { Address } from '@libp2p/interface-peer-store';
import { isLoopback } from '@libp2p/utils/multiaddr/is-loopback';
import { isPrivate } from '@libp2p/utils/multiaddr/is-private';
import { all as WSAllfilter } from '@libp2p/websockets/filters';
import { Multiaddr as MultiaddrType } from '@multiformats/multiaddr';
import { Buffer } from 'buffer/';
import { pipe } from 'it-pipe';
import localforage from 'localforage';
import Multiaddr from 'multiaddr';

import type { P2pClient } from '.';
import { logger } from '../logging';
import { nativeFetch } from '../p2p-fetch/override-fetch';
import status from '../status';

export class BootstrapList {
    private log = logger.getLogger('worker/p2p/bootstrap');

    private latencyMap: Map<string, number> = new Map();
    private latencySet: Set<string> = new Set();

    constructor(private client: P2pClient) {
        let relayDebounce = 0;
        client.addEventListener('connected', () => {
            if (Date.now() - relayDebounce > 60000) {
                relayDebounce = Date.now();
                this.openRelayStream();
            }
        });
    }

    private isRelay(ma: Address): boolean {
        const parts = new Set(ma.multiaddr.toString().split('/'));
        return parts.has('p2p-circuit');
    }
    private isDNS(ma: Address): boolean {
        const parts = new Set(ma.multiaddr.toString().split('/'));
        return parts.has('dns4');
    }

    // slightly modified version of
    // https://github.com/libp2p/js-libp2p-utils/blob/66e604cb0bfcf686eb68e44f278d62e3464c827c/src/address-sort.ts
    // the goal here is to couple prioritizing relays with parallelism
    public publicRelayAddressesFirst(a: Address, b: Address): -1 | 0 | 1 {
        this.log.trace(
            'Sorting: ',
            a.multiaddr.toString(),
            b.multiaddr.toString()
        );

        const haveLatencyA = this.latencyMap.has(a.multiaddr.toString());
        const haveLatencyB = this.latencyMap.has(b.multiaddr.toString());

        // if we only have one latency, it's the one we want
        if (haveLatencyA && !haveLatencyB) {
            return -1;
        }
        if (!haveLatencyA && haveLatencyB) {
            return 1;
        }

        if (haveLatencyA && haveLatencyB) {
            // if we have latency info for both, prefer non relay
            const isARelay = this.isRelay(a);
            const isBRelay = this.isRelay(b);
            if (isARelay && !isBRelay) {
                return 1;
            }
            if (!isARelay && isBRelay) {
                return -1;
            }
            // if both/neither are relays, prefer the one with lower latency
            const latencyA =
                this.latencyMap.get(a.multiaddr.toString()) || Infinity;
            const latencyB =
                this.latencyMap.get(b.multiaddr.toString()) || Infinity;
            if (latencyA < latencyB) {
                return -1;
            }
            if (latencyA > latencyB) {
                return 1;
            }

            // if both have the same latency, return 0
            return 0;
        }

        // we should never get here, but not sure on where this vs filter
        // is called, so leaving old logic just in case;

        const isADNS = this.isDNS(a);
        const isBDNS = this.isDNS(b);
        const isAPrivate = isPrivate(a.multiaddr);
        const isBPrivate = isPrivate(b.multiaddr);

        if (isADNS && !isBDNS) {
            return 1;
        } else if (!isADNS && isBDNS) {
            return -1;
        } else if (isAPrivate && !isBPrivate) {
            return 1;
        } else if (!isAPrivate && isBPrivate) {
            return -1;
        } else if (!(isAPrivate || isBPrivate)) {
            const isARelay = this.isRelay(a);
            const isBRelay = this.isRelay(b);

            if (isARelay && !isBRelay) {
                return -1;
            } else if (!isARelay && isBRelay) {
                return 1;
            } else {
                return 0;
            }
        } else if (isAPrivate && isBPrivate) {
            const isALoopback = isLoopback(a.multiaddr);
            const isBLoopback = isLoopback(b.multiaddr);

            if (isALoopback && !isBLoopback) {
                return 1;
            } else if (!isALoopback && isBLoopback) {
                return -1;
            } else {
                return 0;
            }
        }

        return 0;
    }

    private async getWSOpenLatency(ma: string): Promise<number> {
        return new Promise(resolve => {
            setTimeout(resolve, 5000, Infinity);
            try {
                const [_nil, _type, host, _tcp, port, _ws, _p2p, id] =
                    ma.split('/');
                const start = Date.now();
                const ws = new WebSocket(`ws://${host}:${port}/p2p/${id}`);
                ws.onopen = () => {
                    ws.close();
                    resolve(Date.now() - start);
                };
                ws.onerror = () => resolve(Infinity);
            } catch (e) {
                this.log.error(e);
                resolve(Infinity);
            }
        });
    }

    private async checkAddress(address: string): Promise<boolean> {
        const latency = await this.getWSOpenLatency(address);
        this.log.trace('Latency for address: ', address, latency);
        if (latency < Infinity) {
            this.latencyMap.set(address, latency);
            this.latencySet.add(address.split('/p2p-circuit')[0]);
            return true;
        }

        return false;
    }

    public async initCheckAddresses(addresses: string[]): Promise<string[]> {
        this.latencyMap = new Map();
        this.latencySet = new Set();
        await Promise.all(addresses.map(it => this.checkAddress(it)));
        return addresses.filter(a => this.latencyMap.has(a));
    }

    private getHostAddrs(hostname: string, tail: string[]): string[] {
        const res = [`/dns4/${hostname}/${tail.join('/')}`];
        if (hostname.endsWith('localhost')) {
            res.push(
                `/dns4/${hostname.substring(
                    0,
                    hostname.length - 4
                )}/${tail.join('/')}`
            );
        }
        this.log.debug('Found host addresses: ', res);
        return res;
    }

    public async getBootstrapList(skipFetch = false) {
        let newBootstrapAddress = null;
        try {
            if (!skipFetch) {
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
            }
        } catch (e) {
            this.log.warn(
                'Error while trying to fetch new bootstrap address: ',
                e
            );
        }
        const cachedBootstrapAddress =
            (await localforage.getItem<string>('libp2p.bootstrap')) ?? null;
        const bootstrapaddr = newBootstrapAddress || cachedBootstrapAddress;
        if (bootstrapaddr !== cachedBootstrapAddress) {
            this.log.info(
                'Detected updated bootstrap address, updating cache: ',
                bootstrapaddr
            );
            await localforage.setItem('libp2p.bootstrap', bootstrapaddr);
        }

        this.log.info('Using bootstrap address: ', bootstrapaddr);
        const relay_addrs =
            (await localforage
                .getItem<string[]>('libp2p.relays')
                .catch(_ => [])) ?? [];
        this.log.info('Got relay addresses: ', relay_addrs);

        const { hostname } = new URL(self.origin);
        const [_, _proto, _ip, ...rest] = bootstrapaddr?.split('/') ?? [];
        const hostaddrs = this.getHostAddrs(hostname, rest);
        const res = [bootstrapaddr ?? '', ...hostaddrs, ...relay_addrs].filter(
            notEmpty => notEmpty
        );
        return res;
    }

    public websocketAddressFilter(addresses: MultiaddrType[]) {
        const res = WSAllfilter(addresses).filter((addr: MultiaddrType) => {
            return this.latencySet.has(addr.toString());
        });
        this.log.trace('Filtered websockets: ', res);
        return res;
    }

    public getQuickestPath(): string | null {
        let quickest = Infinity;
        let quickestAddr = null;
        for (const [addr, latency] of this.latencyMap.entries()) {
            if (latency < quickest) {
                quickest = latency;
                quickestAddr = addr;
            }
        }
        return quickestAddr;
    }

    private async openRelayStream(cb?: () => unknown) {
        const stream = await this.client.getStream('/samizdapp-relay');
        let gotFirstRelay = false;
        this.log.trace('Got relay stream: ', stream);
        await pipe(stream.source, async source => {
            for await (const msg of source) {
                const str_relay = Buffer.from(msg.subarray()).toString();
                if (await this.checkAddress(str_relay)) {
                    if (!gotFirstRelay) {
                        gotFirstRelay = true;
                        cb?.();
                        await localforage.setItem('libp2p.relays', []);
                    }
                    await localforage
                        .getItem<string[]>('libp2p.relays')
                        .then(str_array => {
                            const dedup = Array.from(
                                new Set([str_relay, ...(str_array || [])])
                            );

                            return localforage.setItem('libp2p.relays', dedup);
                        });
                    const multiaddr = Multiaddr.multiaddr(
                        str_relay
                    ) as unknown as MultiaddrType;

                    this.client.addServerPeerAddress(multiaddr);

                    // update status
                    if (!status.relays.includes(str_relay)) {
                        status.relays.push(str_relay);
                    }
                }
            }
        }).catch(e => {
            this.log.warn('Error in pipe: ', e);
        });
        // we wan't fetch streams to have priority, so let's ease up this loop
        await new Promise(r => setTimeout(r, 20000));
    }
}
