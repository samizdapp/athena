import rpc from './rpc'
import dns from './dns'
import { EventEmitter } from 'stream'

const waitFor = async (ms: number) => new Promise(r => setTimeout(r, ms))

class YggdrassilCrawler extends EventEmitter {
    private isStarted = false;
    private dudResetTrigger = 100
    private dudResetCount = 0
    private duds = new Set()
    private currentCrawl: Promise<void> = Promise.resolve()

    private getWaitTime(){
        if (this.dudResetCount > 0){
            return 1000 * this.dudResetCount
        }
        return 1000
    }

    async start(){
        if (this.isStarted) return
        this.isStarted = true
        while(this.isStarted){
            this.currentCrawl = this.crawl()
            await this.currentCrawl
            await waitFor(this.getWaitTime())
        }
    }

    async stop(){
        this.isStarted = false
        await this.currentCrawl
    }

    private async getInitialCrawl(){
        const crawling = Array.from(await dns.keys())
        if (crawling.length === 0) {
            const self = await rpc.getSelf()
            if (!self) {
                throw new Error('unable to get self')
            }
            const selfNodeInfo = await rpc.getNodeInfo(self.key)
            if (!selfNodeInfo) {
                throw new Error('unable to get self node info')
            }
            await dns.consumeNodeInfo(self.key, selfNodeInfo)
            const selfPeers = await rpc.getPeers()
            for (const peer of selfPeers) {
                crawling.push(peer)
            }
        }
        return crawling
    }

    async crawl(){
        const crawling = await this.getInitialCrawl()
        const queried = new Set()
        const startSize = crawling.length
        console.log('starting crawl, previously known keys: ', startSize)
        let found = 0
        let dudsInARow = 0
        let key = null
        while(this.isStarted && (key = crawling.shift())) {
            if (dudsInARow > this.dudResetTrigger){
                if (found === startSize){
                    this.dudResetCount++
                }
                break
            }
            if (queried.has(key)) {
                continue
            }
            //console.log('crawling', key, 'found', found, 'duds in a row', dudsInARow, 'dud reset count', this.dudResetCount)
            
            queried.add(key)
            const nodeInfo = await rpc.getNodeInfo(key)
            const isFound = !nodeInfo ? false : await dns.consumeNodeInfo(key, nodeInfo)

            let insert = crawling.push.bind(crawling)
            if (isFound){
                console.log('found, emit event', key)
                this.emit('found', key, nodeInfo)
                found++
                dudsInARow = 0
                insert = found >= startSize ? (peer) => {
                    console.log('inserting peer for',  peer)
                    return crawling.unshift(peer)
                } : insert
            } else {
                this.duds.add(key)
                dudsInARow++
            }

            const peers = await rpc.debug_remoteGetPeers(key)
            for (const peer of peers) {
                insert(peer)
            }
        }
    }
}

export default new YggdrassilCrawler()