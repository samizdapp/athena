import rpc from './rpc'
import {readFileSync, readFile, writeFile, utimesSync, openSync, closeSync} from 'fs'
import {environment} from '../environments/environment'

const HOST_HEADER = `
127.0.0.1	localhost.localdomain		localhost

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`

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

    async consumeNodeInfo (key: Key, nodeInfo: NodeInfo | null): Promise<boolean>{
        if (nodeInfo?.samizdapp){
            // TODO: this should perform a diff and only update the hosts file if there are changes
            // since we haven't implemented a way to chenge nodeInfo.samizdapp.groups yet, this is fine
            if (this.store.has(key)) return true;
            this.store.set(key, nodeInfo)
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

    has(key: Key){
        return this.store.has(key)
    }

    get(key: Key){
        return this.store.get(key)
    }

    async save(){
        const lines = [HOST_HEADER]
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
        const oldContent = await this.read()
        if (oldContent === content) return console.log('hosts file is up to date')
        console.log('updating hosts file')
        return new Promise<void>(
            (resolve, reject) => 
                writeFile(environment.hostsfile, content, (err) => {
                    if (err) return reject(err)
                    resolve()
                })
        )
    }

    private async read(){
        const content = await new Promise<string>(
            (resolve, reject) => 
                readFile(environment.hostsfile, 'utf8', (err, data) => {
                    if (err) return reject(err)
                    resolve(data)
                })
        )
        return content
    }
}

export default new YggdrasilDNS()