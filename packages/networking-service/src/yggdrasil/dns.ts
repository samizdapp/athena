import rpc from './rpc';
import {
    readFileSync,
    readFile,
    writeFile,
    utimesSync,
    openSync,
    closeSync,
} from 'fs';
import { environment } from '../environment';
import { Debug } from '../logging';

const HOST_HEADER = `
127.0.0.1	localhost.localdomain		localhost

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`;

const time = new Date();

try {
    utimesSync(environment.hostsfile, time, time);
} catch (e) {
    const fd = openSync(environment.hostsfile, 'a');
    closeSync(fd);
}

type Key = string;
type Address = string;

type NodeInfo = {
    address: Address;
    samizdapp?: {
        groups: string[];
    };
};

class YggdrasilDNS {
    private readonly log = new Debug('yggdrasil-dns');

    private store = new Map<string, NodeInfo>();

    constructor() {
        this.load();
    }

    private hostnameToKey(hostname: string): Key | null {
        const [_yg, key2, key1] = hostname.split('.').reverse();
        if (_yg !== 'yg') return null;
        return key1 + key2;
    }

    private load() {
        this.log.trace('load');
        readFileSync(environment.hostsfile, 'utf8')
            .split('\n')
            .map(line => line.split(' '))
            .filter(([_, hostname]) => hostname?.endsWith('.yg'))
            .reduce((map, [address, hostname]) => {
                const key = this.hostnameToKey(hostname);
                if (!key) return map;
                const nodeInfo = map.get(key) || { address };
                if (!nodeInfo.samizdapp) {
                    nodeInfo.samizdapp = { groups: [] };
                }
                nodeInfo.samizdapp.groups.push(hostname.split('.')[0]);
                map.set(key, nodeInfo);
                return map;
            }, this.store);
    }

    async consumeNodeInfo(
        key: Key,
        nodeInfo: NodeInfo | null
    ): Promise<boolean> {
        this.log.trace('consumeNodeInfo', key, nodeInfo);
        if (nodeInfo?.samizdapp) {
            // TODO: this should perform a diff and only update the hosts file if there are changes
            // since we haven't implemented a way to change nodeInfo.samizdapp.groups yet, this is fine
            if (this.store.has(key)) return true;
            this.store.set(key, nodeInfo);
            this.log.debug('consumed new node info', key, nodeInfo);
            return true;
        }
        return false;
    }

    async removeNodeInfo(key: Key) {
        this.store.delete(key);
        await this.save();
    }

    async lookup(hostname: string): Promise<Address | null> {
        this.log.trace('lookup', hostname);
        const key = this.hostnameToKey(hostname);

        if (!key) {
            this.log.warn('lookup: invalid hostname', hostname);
            return null;
        } else if (!this.store.has(key)) {
            this.log.trace('lookup: not in store, fetching from node', key);
            const nodeInfo = await rpc.getNodeInfo(key).catch(() => null);
            if (!nodeInfo) {
                this.log.warn('lookup: node not found', key);
                return null;
            }
            await this.consumeNodeInfo(key, nodeInfo);
        }
        const res = this.store.get(key)?.address || null;
        this.log.debug('lookup result', hostname, res);
        return res;
    }

    keys() {
        return this.store.keys();
    }

    has(key: Key) {
        return this.store.has(key);
    }

    get(key: Key) {
        return this.store.get(key);
    }

    async save() {
        const lines = [HOST_HEADER];
        for (const [key, nodeInfo] of this.store) {
            const address = nodeInfo.address;
            const groups = nodeInfo.samizdapp?.groups || [];
            for (const group of groups) {
                const [key1, key2] = [key.slice(0, 63), key.slice(63)];
                const hostname = [group, key1, key2, 'yg'].join('.');
                const line = [address, hostname].join(' ');
                lines.push(line);
            }
        }
        const content = lines.join('\n');
        const oldContent = await this.read();
        if (oldContent === content)
            return this.log.debug('hosts file is up to date, skipping save');
        this.log.info('saving hosts file, set to debug to see diff');
        this.log.debug('old:\n', oldContent, 'new:\n', content);
        return new Promise<void>((resolve, reject) =>
            writeFile(environment.hostsfile, content, err => {
                if (err) return reject(err);
                resolve();
            })
        );
    }

    private async read() {
        try {
            this.log.debug('reading hosts file', environment.hostsfile);
            const content = await new Promise<string>((resolve, reject) =>
                readFile(environment.hostsfile, 'utf8', (err, data) => {
                    if (err) return reject(err);
                    resolve(data);
                })
            );
            return content;
        } catch (e) {
            this.log.debug('hosts file not found, returning header');
            return HOST_HEADER;
        }
    }
}

export default new YggdrasilDNS();
