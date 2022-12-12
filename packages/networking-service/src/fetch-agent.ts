import yggdrasilDNS from './yggdrasil/dns';
import http from 'http';
import https from 'https';
import dns from 'dns';
import { LookupFunction } from 'net';
import { Debug } from './logging';
import fetch, { RequestInit } from 'node-fetch';

class FetchAgent {
    private readonly log = new Debug('fetch-agent');

    public fetch(url: string, options: RequestInit = {}) {
        this.log.trace('fetch', url, options);
        options.agent = this.getAgent(url);
        return fetch(url, options);
    }

    public getAgent(url: string) {
        this.log.trace('getAgent', url);
        const _u = new URL(url);
        const httpModule = _u.protocol === 'http:' ? http : https;
        return new httpModule.Agent({ lookup: this.staticLookup() });
    }

    private staticLookup = (): LookupFunction => {
        const lookup: LookupFunction = async (hostname, _, cb) => {
            if (hostname.endsWith('.localhost')) {
                this.log.trace('intercepting localhost', hostname);
                return cb(null, '127.0.0.1', 4);
            }

            if (hostname.endsWith('.yg')) {
                this.log.trace('intercepting yg', hostname);
                const ip = await yggdrasilDNS
                    .lookup(hostname)
                    .catch(_e => null);
                this.log.trace('intercepted yg', hostname, ip);
                if (ip) {
                    return cb(null, ip, 6);
                }
            }

            dns.resolve(hostname, (err, addresses) => {
                if (err) {
                    return cb(err, '', 4);
                }
                this.log.trace('intercepted', hostname, addresses[0]);
                return cb(null, addresses[0], 4);
            });
        };
        return lookup;
    };
}

export default new FetchAgent();
