import rpc, { NodeInfo } from './rpc';
import dns from './dns';
import { EventEmitter } from 'stream';
import { ScalableBloomFilter } from 'bloom-filters';

const waitFor = async (ms: number) => new Promise(r => setTimeout(r, ms));

class YggdrassilCrawler extends EventEmitter {
    private isStarted = false;
    private dudResetCount = 0;
    private duds = new ScalableBloomFilter();
    private currentCrawl: Promise<void> = Promise.resolve();
    private touched = new Set();
    private found = new Set();

    private getWaitTime() {
        if (this.dudResetCount > 0) {
            return 60000 * this.dudResetCount;
        }
        return 60000;
    }

    async start() {
        if (this.isStarted) return;
        this.isStarted = true;
        while (this.isStarted) {
            console.log('scanning...');
            this.currentCrawl = this.scan();
            await this.currentCrawl;
            await dns.save();
            await waitFor(this.getWaitTime());
        }
    }

    async stop() {
        this.isStarted = false;
        await this.currentCrawl;
    }

    private async getInitialCrawl() {
        const crawling = Array.from(await dns.keys());
        if (crawling.length === 0) {
            console.log('no known keys, crawling self');
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
        return crawling;
    }

    async scanNodeInfo(key: string) {
        if (dns.has(key)) {
            const nodeInfo = await dns.get(key);
            this.emitFoundOnce(key, nodeInfo as unknown as NodeInfo);
            return {
                found: true,
                nodeInfo,
                key,
            };
        }
        if (this.duds.has(key)) {
            return {
                key,
                found: false,
            };
        }
        const nodeInfo = await rpc.getNodeInfo(key);
        const found = await dns.consumeNodeInfo(key, nodeInfo);
        if (found) {
            this.emitFoundOnce(key, nodeInfo as unknown as NodeInfo);
        } else if (nodeInfo) {
            this.duds.add(key);
        }
        return {
            found,
            nodeInfo,
            key,
        };
    }

    async scan(keys?: string[], depth = 4) {
        if (!keys?.length) {
            keys = await this.getInitialCrawl();
        }
        if (!depth) {
            this.touched = new Set();
            return;
        }
        const nodeInfoJobs = [];
        for (const key of keys) {
            if (!key) continue;
            if (this.touched.has(key)) continue;
            this.touched.add(key);
            // console.log('scanning', key)
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
            // console.log('getting peers for', key)
            peerJobs.push(rpc.debug_remoteGetPeers(key));
        }

        const nexthops = Array.from(
            new Set((await Promise.all(peerJobs)).flat())
        );
        // console.log('nexthops', JSON.stringify(nexthops, null, 4))
        depth--;
        await this.scan(nexthops, depth);
    }

    private emitFoundOnce(key: string, nodeInfo: NodeInfo) {
        if (this.found.has(key)) return;
        this.found.add(key);
        this.emit('found', key, nodeInfo);
    }
}

export default new YggdrassilCrawler();
