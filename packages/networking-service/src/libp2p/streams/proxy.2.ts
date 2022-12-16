import { LobStream } from './lob';
import { Packet, encode } from './lob-enc';
import { RequestInit, Headers, Response } from 'node-fetch';
import fetchAgent from '../../fetch-agent';

export class ProxyStream2 extends LobStream {
    hasResponse = Promise.resolve();

    async init() {
        while (this.isOpen) {
            const reqPacket = await this.receive();
            if (!reqPacket) {
                continue;
            }
            this.log.debug('fetch request', reqPacket, this.peer);

            const { url, init } = this.processRequest(reqPacket);
            const response = await this.fetch(url, init);
            if (response instanceof Error) {
                this.log.debug('fetch error', response);
                await this.writeError(response);
                continue;
            }
            const resPacket = await this.processResponse(response);

            this.log.debug('fetch response', resPacket, this.peer);

            await this.send(resPacket);
        }
    }

    private async processResponse(response: Response) {
        this.log.debug('processResponse', response.url, this.peer);
        const resb = await response.arrayBuffer();
        const res = this.getResponseJSON(response);
        const body = Buffer.from(resb);
        const responsePacket = encode(
            { res, bodyLength: body.byteLength },
            body
        );
        this.log.debug(
            'processResponse result',
            response.url,
            responsePacket,
            this.peer
        );
        return responsePacket;
    }

    private getResponseJSON(r: Response) {
        return {
            ok: r.ok,
            headers: this.getHeadersJSON(r.headers),
            redirected: r.redirected,
            status: r.status,
            statusText: r.statusText,
            type: r.type,
            url: r.url,
        };
    }

    private getHeadersJSON(h: Headers) {
        const ret = {} as Record<string, string>;
        for (const pair of h.entries()) {
            ret[pair[0]] = pair[1];
        }
        return ret;
    }

    private async fetch(
        url: string,
        init: RequestInit
    ): Promise<Response | Error> {
        try {
            this.log.debug('fetch', url, init, this.peer);
            const res = await fetchAgent.fetch(url, init);
            return res as Response;
        } catch (e) {
            this.log.warn('fetch error', e);
            return Promise.resolve<Error>(e as Error);
        }
    }

    private async writeError(error: Error) {
        const body = Buffer.from(
            error?.toString ? error.toString() : 'unknown error'
        );
        await this.send(encode({ error, bodyLength: body.byteLength }, body));
    }

    processRequest(packet: Packet): { url: string; init: RequestInit } {
        this.log.debug('processRequest', packet, this.peer);
        let url, init;
        const reqObj = packet.json.reqObj as
            | { method?: string; url?: string; body?: Buffer }
            | string;
        let reqInit = packet.json.reqInit as { method?: string; body?: Buffer };
        // console.log("set body", body ? body.toString() : "");
        if (typeof reqObj === 'string') {
            url = reqObj.startsWith('http')
                ? reqObj
                : `http://localhost${reqObj}`;
            if (
                reqInit.method &&
                reqInit.method !== 'HEAD' &&
                reqInit.method !== 'GET'
            ) {
                reqInit.body = packet.body;
            }
            init = reqInit;
        } else if (typeof reqObj !== 'string') {
            reqInit = reqObj;
            url = reqObj.url;
            if (
                reqObj.method &&
                reqObj.method !== 'HEAD' &&
                reqObj.method !== 'GET'
            ) {
                reqObj.body = packet.body;
            }
            init = reqObj;
        }

        const res = { url, init } as {
            url: string;
            init: RequestInit;
        };

        this.log.debug('processRequest result', res, this.peer);

        return res;
    }
}
