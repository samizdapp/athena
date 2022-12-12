import crawler from '../yggdrasil/crawler';
import getAgent from '../fetch-agent';
import upnp from '../upnp';
import fetch from 'node-fetch';
import { HeartbeatStream, HeartbeatType } from './streams/heartbeat';
import { Deferred } from './streams/raw';
import node from './node';
import { environment } from '../environments/environment';
import { EventEmitter } from 'stream';
const waitFor = (ms: number) => new Promise(r => setTimeout(r, ms));

class ActiveRelay {
    private readonly pollInterval = 10000;
    private _isAlive = new Deferred<boolean>();
    private _keepAlive = true;
    constructor(private readonly relayAddr: string) {
        this.start().catch(e => {
            console.log('relay keep alive failed', e);
            this.stop();
        });
    }

    stop() {
        this._keepAlive = false;
    }

    private async start() {
        while (this._keepAlive) {
            console.log('keep alive', this.relayAddr);
            await this.keepAlive();
            console.log('keep alive closed', this.relayAddr);
        }
    }

    private async keepAlive() {
        const heartbeatStream = await this.getHeartbeatStream();
        this._isAlive.resolve(true);
        await heartbeatStream.waitForClose();
    }

    private async getHeartbeatStream() {
        let conn = null;
        while (!conn) {
            console.log('poll dial', this.relayAddr);
            conn = await node.dialProtocol(
                this.relayAddr,
                '/samizdapp-heartbeat'
            );
            await waitFor(this.pollInterval);
        }

        return new HeartbeatStream(conn, HeartbeatType.RECEIVER);
    }

    public isAlive() {
        return this._isAlive.promise;
    }
}

class Libp2pRelays extends EventEmitter {
    private readonly potentialRelays = new Set<string>();
    private readonly activeRelays = new Map<string, ActiveRelay>();

    constructor() {
        super();
        crawler.on('found', this.handleFound.bind(this));
    }

    async handleFound(key: string) {
        const relayQueryUrl = this.getRelayQueryUrl(key);
        console.log('found key', key, relayQueryUrl);
        const agent = getAgent(relayQueryUrl);
        try {
            const relay = await fetch(relayQueryUrl, { agent });
            if (relay.ok) {
                const relayAddr = await relay.text();
                console.log('found relay addr for key', key, relayAddr);
                await this.addRelay(relayAddr);
            } else {
                console.log('relay query failed', relayQueryUrl, relay.status);
            }
        } catch (e) {
            console.log('relay query failed', relayQueryUrl, e);
        }
    }

    private getRelayQueryUrl(key: string) {
        return `https://yggdrasil.${key.substring(0, 63)}.${key.substring(
            63
        )}.yg/libp2p.relay`;
    }

    private async addRelay(relayAddr: string) {
        this.potentialRelays.add(relayAddr);
        const upnpInfo = await upnp.info();
        if (!upnpInfo.libp2p.publicPort || environment.force_relay_open) {
            console.log('opening relay', relayAddr);
            await this.activateRelay(relayAddr);
            this.activeRelays.set(relayAddr, new ActiveRelay(relayAddr));
        }
    }

    private async activateRelay(relayAddr: string) {
        console.log('activating relay', relayAddr);
        const relay = new ActiveRelay(relayAddr);
        const alive = await relay.isAlive();
        if (alive) {
            console.log('relay activated', relayAddr);
            this.potentialRelays.delete(relayAddr);
            this.activeRelays.set(relayAddr, relay);
            this.emit('activate', relayAddr);
        }
    }

    public async getRelays() {
        const selfPeerString = await node.getSelfPeerString();
        return Array.from(this.activeRelays.keys()).map(
            addr => `${addr}/p2p-circuit/p2p/${selfPeerString}`
        );
    }
}

export default new Libp2pRelays();
