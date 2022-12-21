import { ScalableBloomFilter } from 'bloom-filters';
import { EventEmitter } from 'stream';

import { environment } from '../environment';
import { Debug } from '../logging';
import { Status, StatusUpdater } from '../status';
import dns from './dns';
import rpc, { NodeInfo } from './rpc';

const waitFor = async (ms: number) => new Promise(r => setTimeout(r, ms));

class YggdrasilCrawler extends EventEmitter {
    private readonly service = 'yggdrasil-crawler';
    private readonly log = new Debug(this.service);
    private readonly status = new StatusUpdater(
        this.service.replaceAll('-', '_')
    );
    private isStarted = true;
    private dudResetCount = 0;
    private duds = new ScalableBloomFilter();
    private currentCrawl: Promise<void> = Promise.resolve();
    private touched = new Set();
    private found = new Set();

    constructor() {
        super();
        this.initialize();
    }

    private initialize() {
        this.status.sendStatus(Status.IDLE, 'Starting up...');
        this.start().catch(async e => {
            this.log.error('crawler error', e);
            this.status.sendStatus(Status.ERROR, e.message);
            await waitFor(60 * 1000);
            this.initialize();
        });
    }

    private getWaitTime() {
        return parseInt(environment.yggdrasil_scan_interval);
    }

    async start() {
        while (this.isStarted) {
            this.log.info('scanning...');
            this.status.sendStatus(Status.ONLINE, 'Scanning...');
            this.currentCrawl = this.scan();
            await this.currentCrawl;
            this.log.info('scanning complete, trigger dns save');
            await dns.save();
            await this.idle();
        }
    }

    async idle() {
        const waitTime = this.getWaitTime();
        this.log.info(`waiting ${waitTime}ms`);
        await waitFor(waitTime);
    }

    private async getInitialCrawl() {
        const crawling = Array.from(await dns.keys());
        if (crawling.length === 0) {
            this.log.debug('no known keys, crawling self');
            const self = await rpc.getSelf();
            if (!self) {
                throw new Error('unable to get self');
            }
            const selfNodeInfo = await rpc.getNodeInfo(self.key);
            if (!selfNodeInfo) {
                throw new Error('unable to get self node info');
            }
            await dns.consumeNodeInfo(self.key, selfNodeInfo);
            const selfPeers = await rpc.getPeers();
            for (const peer of selfPeers) {
                crawling.push(peer);
            }
        }
        this.log.debug(`initial crawl: ${crawling.length} keys`);
        return crawling;
    }

    async scanNodeInfo(key: string) {
        this.log.debug('scanning node info', key);
        if (dns.has(key)) {
            this.log.debug('found in dns', key);
            const nodeInfo = await dns.get(key);
            this.emitFoundOnce(key, nodeInfo as unknown as NodeInfo);
            return {
                found: true,
                nodeInfo,
                key,
            };
        }
        if (this.duds.has(key)) {
            this.log.debug('found in duds', key);
            return {
                key,
                found: false,
            };
        }
        this.log.trace('getting node info', key);
        const nodeInfo = await rpc.getNodeInfo(key);
        const found = await dns.consumeNodeInfo(key, nodeInfo);
        if (found) {
            this.log.debug('found by node info query', key);
            this.emitFoundOnce(key, nodeInfo as unknown as NodeInfo);
        } else if (nodeInfo) {
            this.log.debug('got node info, but rejected by dns', key);
            this.duds.add(key);
        }
        const trace = {
            found,
            nodeInfo,
            key,
        };
        this.log.trace('got node info', JSON.stringify(trace, null, 4));
        return trace;
    }

    async scan(keys?: string[], depth = 4) {
        if (!keys?.length) {
            this.log.debug('no keys, getting initial crawl');
            keys = await this.getInitialCrawl();
        }
        if (!depth) {
            this.log.debug('depth 0, returning');
            this.touched = new Set();
            return;
        }
        const nodeInfoJobs = [];
        for (const key of keys) {
            if (!key) continue;
            if (this.touched.has(key)) continue;
            this.touched.add(key);
            nodeInfoJobs.push(this.scanNodeInfo(key));
            await waitFor(1);
        }

        const nodeInfos = await Promise.all(nodeInfoJobs);

        const sorted = nodeInfos.sort((a, b) => {
            if (a.found && !b.found) return -1;
            if (!a.found && b.found) return 1;
            return 0;
        });

        const peerJobs = [];

        for (const { key } of sorted) {
            peerJobs.push(rpc.debug_remoteGetPeers(key));
            await waitFor(1);
        }

        const nextHops = Array.from(
            new Set((await Promise.all(peerJobs)).flat())
        );
        this.log.debug(
            'depth, nextHops',
            depth,
            JSON.stringify(nextHops, null, 4)
        );
        depth--;
        await this.scan(nextHops, depth);
    }

    private emitFoundOnce(key: string, nodeInfo: NodeInfo) {
        this.log.debug('emit found once', key, nodeInfo);
        if (this.found.has(key)) return;
        this.found.add(key);
        this.log.info('emitting found', key, nodeInfo);
        this.emit('found', key, nodeInfo);
    }
}

export default new YggdrasilCrawler();
