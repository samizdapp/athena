import yggdrasilDNS from './yggdrasil/dns';
import http from 'http';
import https from 'https';
import dns from 'dns';
import { LookupFunction } from 'net';
import { Debug } from './logging';
import type { RequestInit, Request, Response } from 'node-fetch';
import { environment } from './environment';

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
        const _inspect = new URL((url as Request).url || 'http://ignore');
        if (_inspect.hostname === `localhost` && environment.nx_local) {
            _inspect.port = '80';
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const { headers, body } = url as Request;
            url = await this.Request(_inspect.toString(), url as Request);
            Object.defineProperties(url, {
                headers: {
                    value: headers,
                },
                body: {
                    value: body,
                },
            });
        }
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
        const fetchPromise = this._fetch!(url, options);
        fetchPromise.then((response: Response) => {
            this.log.info(
                'fetch response',
                randomUUID,
                response.status,
                response.statusText
            );
            this.log.debug('', Array.from(response.headers?.entries() || []));
        });
        return fetchPromise;
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
