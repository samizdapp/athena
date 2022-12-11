import crawler from '../yggdrasil/crawler';
import getAgent from '../fetch-agent';
import { Libp2p } from '@athena/shared/libp2p';
import upnp from '../upnp';
import nodeProm from './node';
import { multiaddr } from '@multiformats/multiaddr';
import fetch from 'node-fetch';
import { HeartbeatStream } from './streams/heartbeat';

const waitFor = (ms: number) => new Promise(r => setTimeout(r, ms));

class ActiveRelay {
    private readonly pollInterval = 10000;
    private node?: Libp2p;
    private _keepAlive = true;
    constructor(private readonly relayAddr: string) {
        nodeProm.then(node => {
            this.node = node;
            this.keepAlive();
        });
    }

    private async start() {
        if (!this.node) {
            throw new Error('node not ready');
        }
        while (this._keepAlive) {
            console.log('keep alive', this.relayAddr);
            await this.keepAlive();
            console.log('keep alive closed', this.relayAddr);
        }
    }

    private async keepAlive() {
        const heartbeatStream = await this.getHeartbeatStream();
        await heartbeatStream.waitForClose();
    }

    private async getHeartbeatStream() {
        let conn = null;
        const addr = multiaddr(this.relayAddr);
        while (!conn) {
            console.log('poll dial', this.relayAddr);
            conn = await this.node?.dialProtocol(addr, '/samizdapp-heartbeat');
            await waitFor(this.pollInterval);
        }

        return new HeartbeatStream(conn);
    }
}

class Libp2pRelays {
    private readonly potentialRelays = new Set<string>();
    private readonly activeRelays = new Map<string, ActiveRelay>();

    constructor() {
        crawler.on('found', this.handleFound.bind(this));
    }

    async handleFound(key: string) {
        const relayQueryUrl = this.getRelayQueryUrl(key);
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
        if (!upnpInfo.libp2p.publicPort) {
            this.activeRelays.set(relayAddr, new ActiveRelay(relayAddr));
        }
    }
}

export default new Libp2pRelays();
