import rpc from './rpc'
import {readFileSync, writeFile, utimesSync, openSync, closeSync} from 'fs'
import {environment} from '../environments/environment'


const time = new Date();

try {
    utimesSync(environment.hostsfile, time, time);
} catch (e) {
    const fd = openSync(environment.hostsfile, 'a');
    closeSync(fd);
}

type Key = string
type Address = string

type NodeInfo = {
    address: Address,
    samizdapp?: {
        groups: string[],
    }
}

class YggdrasilDNS {
    private store = new Map<string, NodeInfo>()

    constructor(){
        this.load()
    }

    private hostnameToKey(hostname: string): Key| null {
        const [_yg, key2, key1] = hostname.split('.').reverse()
        if (_yg !== 'yg') return null
        return key1 + key2
    }

    private load(){
        readFileSync(environment.hostsfile, 'utf8')
                    .split('\n')
                    .map(line => line.split(' '))
                    .filter(([_, hostname]) => hostname?.endsWith('.yg'))
                    .reduce((map, [address, hostname]) => {
                        const key = this.hostnameToKey(hostname)
                        if (!key) return map
                        const nodeInfo = map.get(key) || {address}
                        if (!nodeInfo.samizdapp) {
                            nodeInfo.samizdapp = {groups: []}
                        }
                        nodeInfo.samizdapp.groups.push(hostname.split('.')[0])
                        map.set(key, nodeInfo)
                        return map
                    }, this.store)
    }

    async consumeNodeInfo (key: Key, nodeInfo: NodeInfo): Promise<boolean>{
        if (nodeInfo.samizdapp){
            // TODO: this should perform a diff and only update the hosts file if there are changes
            // since we haven't implemented a way to chenge nodeInfo.samizdapp.groups yet, this is fine
            if (this.store.has(key)) return true;
            this.store.set(key, nodeInfo)
            await this.save()
            return true;
        }
        return false;
    }

    async removeNodeInfo(key: Key){
        this.store.delete(key)
        await this.save()
    }
    

    async lookup(hostname: string): Promise<Address | null> {
        const key = this.hostnameToKey(hostname)
        if (!key) return null
        if (!this.store.has(key)) {
            const nodeInfo = await rpc.getNodeInfo(key).catch(() => null)
            if (!nodeInfo) return null
            await this.consumeNodeInfo(key, nodeInfo)
        }
        return this.store.get(key)?.address || null;
    }

    keys(){
        return this.store.keys()
    }

    async save(){
        const lines = []
        for (const [key, nodeInfo] of this.store ){
            const address = nodeInfo.address
            const groups = nodeInfo.samizdapp?.groups || []
            for (const group of groups){
                const [key1, key2] = [key.slice(0, 63), key.slice(63)]
                const hostname = [group, key1, key2, 'yg'].join('.')
                const line = [address, hostname].join(' ')
                lines.push(line)
            }
        }
        const content = lines.join('\n')
        return new Promise<void>(
            (resolve, reject) => 
                writeFile(environment.hostsfile, content, (err) => {
                    if (err) return reject(err)
                    resolve()
                })
        )

    }
}

export default new YggdrasilDNS()