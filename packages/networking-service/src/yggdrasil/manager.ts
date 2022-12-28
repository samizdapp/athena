import { writeFile } from 'node:fs/promises';

import { environment } from '../environment';
import fetchAgent from '../fetch-agent';
import { Debug } from '../logging';
import upnp from '../upnp';
import config from './config';
import crawler from './crawler';
import { NodeInfo } from './rpc';

class YggdrasilManager {
    private readonly log = new Debug('yggdrasil-manager');

    constructor() {
        crawler.on('found', this.handleFound.bind(this));
        this.start();
    }

    async start() {
        this.log.info('starting yggdrasil crawler');
        await this.writeYggdrasilPeerFile();
        this.log.info('started yggdrasil crawler');
    }

    private getPeerQueryUrl(key: string) {
        return `https://yggdrasil.${key.substring(0, 63)}.${key.substring(
            63
        )}.yg/peer`;
    }

    private async handleFound(key: string, _nodeInfo: NodeInfo) {
        this.log.debug('found key, add to allowed keys', key);
        const peerQueryUrl = this.getPeerQueryUrl(key);
        this.log.trace('query peer url', key, peerQueryUrl);
        const peer = environment.production
            ? await fetchAgent
                  .fetch(peerQueryUrl)
                  .then(res => res.text())
                  .catch(_e => null)
            : null;
        this.log.trace('got peer response?', peerQueryUrl, peer);
        await config.allowPublicKey(key);
        if (peer) {
            this.log.debug('found peer addr for key', key, peer);
            await config.addPeer(peer);
        }
        config.save();
    }

    private async writeYggdrasilPeerFile() {
        const peerString = await this.getSelfPeerString();
        this.log.debug('writing yggdrasil peer file', peerString);
        if (peerString) {
            writeFile(environment.yggdrasil_peer_file, peerString, {
                encoding: 'utf8',
            });
        }
    }

    public async getSelfPeerString() {
        const upnpInfo = await upnp.info();
        const externalHost = upnpInfo.yggdrasil.publicHost;
        const externalPort = upnpInfo.yggdrasil.publicPort;
        let res = null;
        if (externalHost && externalPort) {
            res = `tcp://${externalHost}:${externalPort}`;
        }
        this.log.debug('got self peer string', res);
        return res;
    }
}

export default new YggdrasilManager();
