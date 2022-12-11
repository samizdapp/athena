import crawler from './crawler';
import { NodeInfo } from './rpc';
import config from './config';
import getAgent from '../fetch-agent';
import fetch from 'node-fetch';
import { environment } from '../environments/environment';
import upnp from '../upnp';
import { writeFile } from 'fs/promises';

class YggdrasilManager {
    private saveDelay = 60000;
    private saveTimeout?: NodeJS.Timeout;
    constructor() {
        crawler.on('found', this.handleFound.bind(this));
    }

    async start() {
        console.log('starting yggdrasil crawler');
        crawler.start();
        await this.writeYggdrasilPeerFile();
    }

    private getPeerQueryUrl(key: string) {
        return `https://yggdrasil.${key.substring(0, 63)}.${key.substring(
            63
        )}.yg/peer`;
    }

    private async handleFound(key: string, _nodeInfo: NodeInfo) {
        // console.log('found key, add to allowed keys', key)
        const peerQueryUrl = this.getPeerQueryUrl(key);
        // console.log('querying peer url', peerQueryUrl)
        const peer = environment.production
            ? await fetch(peerQueryUrl, {
                  agent: getAgent(peerQueryUrl),
              })
                  .then(res => res.text())
                  .catch(_e => null)
            : null;
        // console.log('got peer response?', peerQueryUrl, peer)
        await config.allowPublicKey(key);
        if (peer) {
            // console.log('found peer addr for key',  key, peer)
            await config.addPeer(peer);
        }
        config.save();
    }

    private async writeYggdrasilPeerFile() {
        const peerString = await this.getSelfPeerString();
        if (peerString) {
            writeFile(environment.yggdrasil_peer_file, peerString, {
                encoding: 'utf8',
            });
        }
    }

    private async getSelfPeerString() {
        const upnpInfo = await upnp.info();
        const externalHost = upnpInfo.yggdrasil.publicHost;
        const externalPort = upnpInfo.yggdrasil.publicPort;
        if (externalHost && externalPort) {
            return `tcp://${externalHost}:${externalPort}`;
        }
        return null;
    }
}

export default new YggdrasilManager();
