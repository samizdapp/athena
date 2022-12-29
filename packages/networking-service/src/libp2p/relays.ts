import { multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';
import { EventEmitter } from 'node:stream';

import { environment } from '../environment';
import fetchAgent from '../fetch-agent';
import { Debug } from '../logging';
import upnp from '../upnp';
import crawler from '../yggdrasil/crawler';
import node from './node';
import { HeartbeatStream, HeartbeatType } from './streams/heartbeat';
import { Deferred } from './streams/raw';

const waitFor = (ms: number) => new Promise(r => setTimeout(r, ms));

class ActiveRelay {
    private readonly log = new Debug('libp2p-active-relay');

    private readonly pollInterval = 10000;
    private _isAlive = new Deferred<boolean>();
    private _keepAlive = true;
    constructor(private readonly relayAddr: string) {
        this.start().catch(e => {
            this.log.error('active relay failed', e);
            this.stop();
        });
    }

    stop() {
        this._keepAlive = false;
    }

    private async start() {
        while (this._keepAlive) {
            this.log.info('keep alive', this.relayAddr);
            await this.keepAlive();
            this.log.info('keep alive closed', this.relayAddr);
        }
    }

    private async keepAlive() {
        const heartbeatStream = await this.getHeartbeatStream();
        this._isAlive.resolve(true);
        await heartbeatStream.waitForClose();
    }

    private async getHeartbeatStream() {
        this.log.info('try get heartbeat stream', this.relayAddr);
        let conn = null;
        while (!conn) {
            this.log.debug('try get heartbeat stream', this.relayAddr);
            conn = await node.dialProtocol(
                this.relayAddr,
                '/samizdapp-heartbeat'
            );
            this.log.debug('got heartbeat stream:', !!conn, this.relayAddr);
            await waitFor(this.pollInterval);
        }
        this.log.info('got heartbeat stream', this.relayAddr);
        conn.metadata = {
            peer: multiaddr(this.relayAddr).getPeerId(),
        };
        return new HeartbeatStream(conn, HeartbeatType.RECEIVER);
    }

    public isAlive() {
        return this._isAlive.promise;
    }
}

class Libp2pRelays extends EventEmitter {
    private readonly log = new Debug('libp2p-relays');

    private readonly potentialRelays = new Set<string>();
    private readonly activeRelays = new Map<string, ActiveRelay>();

    constructor() {
        super();
        crawler.on('found', this.handleFound.bind(this));
    }

    async handleFound(key: string) {
        const relayQueryUrl = this.getRelayQueryUrl(key);
        this.log.debug('found key from crawler', key, relayQueryUrl);
        try {
            const relay = await fetchAgent.fetch(relayQueryUrl);
            if (relay.ok) {
                const relayAddr = await relay.text();
                this.log.info('found relay addr for key', key, relayAddr);
                await this.addRelay(relayAddr);
            } else {
                this.log.warn(
                    'relay query failed',
                    relayQueryUrl,
                    relay.status
                );
            }
        } catch (e) {
            this.log.warn('relay query failed', relayQueryUrl);
            this.log.trace(e as string);
        }
    }

    private getRelayQueryUrl(key: string) {
        return `https://yggdrasil.${key.substring(0, 63)}.${key.substring(
            63
        )}.yg/libp2p.relay`;
    }

    private async addRelay(relayAddr: string) {
        this.log.debug('maybe adding relay', relayAddr);
        this.potentialRelays.add(relayAddr);
        const upnpInfo = await upnp.info();
        if (!upnpInfo.libp2p.publicPort || environment.force_relay_open) {
            await this.activateRelay(relayAddr);
            this.activeRelays.set(relayAddr, new ActiveRelay(relayAddr));
        }
    }

    private async activateRelay(relayAddr: string) {
        this.log.debug('activating relay', relayAddr);
        const relay = new ActiveRelay(relayAddr);
        const alive = await relay.isAlive();
        if (alive) {
            this.log.info('relay activated', relayAddr);
            this.potentialRelays.delete(relayAddr);
            this.activeRelays.set(relayAddr, relay);
            this.emit('activate', relayAddr);
        }
    }

    public async getRelays() {
        const selfPeerString = await node.getSelfPeerString();
        this.log.trace('self peer string', selfPeerString);
        return Array.from(this.activeRelays.keys()).map(
            addr => `${addr}/p2p-circuit/p2p/${selfPeerString}`
        );
    }
}

export default new Libp2pRelays();
