import type { Request, RequestInit, Response } from 'node-fetch';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { LookupFunction } from 'node:net';

import { environment } from './environment';
import { Debug } from './logging';
import yggdrasilDNS from './yggdrasil/dns';

class FetchAgent {
    private readonly log = new Debug('fetch-agent');
    private _fetch: typeof import('node-fetch').default | null = null;
    _Request: typeof Request | null = null;
    _Response: typeof Response | null = null;
    private ready: Promise<void>;

    constructor() {
        this.log.debug('constructor');
        this.ready = this.init();
    }

    private async init() {
        const _import = new Function('specifier', 'return import(specifier)');
        const __fetch = await _import('node-fetch');
        this._fetch = __fetch.default;
        this._Request = __fetch.Request;
        this._Response = __fetch.Response;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async Response(...args: any[]) {
        await this.ready;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return new this._Response!(...args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async Request(arg1: any, arg2: any) {
        await this.ready;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return new this._Request!(arg1, arg2);
    }

    public async fetch(url: string | Request, options: RequestInit = {}) {
        await this.ready;
        options.agent = this.getAgent((url as Request).url || (url as string));
        const randomUUID = Math.random().toString(36).substring(2, 15);
        this.log.info(
            'fetch',
            randomUUID,
            (url as Request).url ?? url,
            options
        );
        this.log.debug(
            '',
            Array.from((url as Request).headers?.entries() || [])
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const response = await this._fetch!(url, options);

        this.log.info(
            'fetch response',
            randomUUID,
            response.status,
            response.statusText
        );
        this.log.debug('', Array.from(response.headers?.entries() || []));

        return response;
    }

    public getAgent(url: string) {
        this.log.trace('getAgent', url);
        const _u = new URL(url);
        const httpModule = _u.protocol === 'http:' ? http : https;
        return new httpModule.Agent({ lookup: this.staticLookup() });
    }

    private staticLookup = (): LookupFunction => {
        const lookup: LookupFunction = async (hostname, _, cb) => {
            if (hostname.endsWith('.yg')) {
                this.log.trace('intercepting yg', hostname);
                if (hostname === environment.yggdrasil_alias_localhost) {
                    hostname = 'localhost';
                } else {
                    const ip = await yggdrasilDNS
                        .lookup(hostname)
                        .catch(_e => null);
                    this.log.trace('intercepted yg', hostname, ip);
                    if (ip) {
                        return cb(null, ip, 6);
                    }
                }
            }

            if (hostname.endsWith('localhost') || hostname.endsWith('local')) {
                this.log.trace(
                    'intercepting localhost',
                    hostname,
                    environment.fetch_localhost_ip
                );
                return cb(null, environment.fetch_localhost_ip, 4);
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
