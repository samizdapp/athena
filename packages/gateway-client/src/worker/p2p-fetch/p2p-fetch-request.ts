import { Buffer } from 'buffer';

import { logger } from '../logging';
import { P2pClient } from '../p2p-client';
import { encode, Packet } from './lob-enc';
import { P2pRequest } from './p2p-request';
import transformers from '../transformers';

type PatchedBody = ReturnType<P2pFetchRequest['patchArgs']>['body'];
type PatchedRequest = ReturnType<P2pFetchRequest['patchArgs']>['reqObj'];
type PatchedRequestInit = ReturnType<P2pFetchRequest['patchArgs']>['reqInit'];

export class P2pFetchRequest {
    private log = logger.getLogger('worker/p2p-fetch/fetch-request');

    private chunkSize = 1024 * 64;

    private requestId = crypto.randomUUID();

    public body: PatchedBody;
    public reqObj: PatchedRequest;
    public reqInit: PatchedRequestInit;

    private givenReqObj: Request;

    constructor(
        private p2pClient: P2pClient,
        givenReqObj: URL | RequestInfo,
        givenReqInit: RequestInit | undefined = {}
    ) {
        // assert that we were given a request and store it
        this.givenReqObj = givenReqObj = givenReqObj as Request;
        if (typeof givenReqObj.url != 'string') {
            throw new Error(
                `Patched service worker \`fetch()\` method expects a full ` +
                    `request object, received ${givenReqObj.constructor.name}`
            );
        }

        // patch args
        let { body, reqObj, reqInit } = this.patchArgs(
            givenReqObj,
            givenReqInit
        );

        // apply transforms
        ({ body, reqObj, reqInit } = this.applyTransforms(
            body,
            reqObj,
            reqInit
        ));

        // store our request
        this.body = body;
        this.reqObj = reqObj;
        this.reqInit = reqInit;
    }

    private copyRequestObject<T>(obj: T) {
        type Key = keyof typeof obj;
        const newObj = {} as {
            [k in Key]: typeof obj[k];
        };
        let key: Key;
        for (key in obj) {
            newObj[key] = obj[key];
        }
        return newObj;
    }

    private patchArgs(givenReqObj: Request, givenReqInit: RequestInit = {}) {
        // patch our request object
        this.givenReqObj = givenReqObj;
        givenReqObj = transformers.transformRequest(givenReqObj);

        // first extract our body from our request
        const body = Promise.resolve(
            givenReqObj.body ??
                givenReqInit.body ??
                givenReqObj.arrayBuffer?.() ??
                null
        );

        // copy our given headers into a POJO
        const rawHeaders = Object.fromEntries(givenReqObj.headers.entries());

        // shallow copy our request object (exclude body)
        const {
            body: _,
            signal: _3,
            ...reqObj
        } = {
            ...this.copyRequestObject(givenReqObj),
            headers: rawHeaders,
            isHistoryNavigation: (
                givenReqObj as Request & { isHistoryNavigation: boolean }
            ).isHistoryNavigation,
        };

        // shallow copy our request init object (exclude body)
        const { body: _2, ...reqInit } = {
            ...this.copyRequestObject(givenReqInit),
            headers: rawHeaders,
        };

        // return our body, request, and request init
        return { body, reqObj, reqInit };
    }

    private applyTransforms(
        body: PatchedBody,
        reqObj: PatchedRequest,
        reqInit: PatchedRequestInit
    ) {
        // resolve relative paths to localhost, includine base path if needed
        const url = new URL(reqObj.url, 'http://localhost');

        // apply subdomain header
        if (url.pathname.startsWith('/smz')) {
            reqObj.headers['X-Intercepted-Subdomain'] = 'samizdapp';
        } else if (url.pathname !== '/manifest.json') {
            reqObj.headers['X-Intercepted-Subdomain'] = 'pleroma';
        }

        // if the url is our current host, redirect to localhost
        if (url.host === self.location.host) {
            const newUrl = new URL(url);
            newUrl.host = 'localhost';
            newUrl.protocol = 'http:';
            newUrl.port = '80';
            // update our request object
            reqObj.url = newUrl.toString();
        }

        // return our transformed request
        return { body, reqObj, reqInit };
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    async createBuffer(body: Object) {
        // attempt to create a buffer from the given body
        try {
            // if we didn't receive a body
            if (!body) {
                // then we can't create a buffer from it
                return undefined;
            }

            // if we received a buffer
            if (Buffer.isBuffer(body)) {
                // return it
                return body;
            }

            // if our body has an array buffer method
            type WithArrayBuffer = {
                arrayBuffer: () => Promise<ArrayBufferLike>;
            };
            if ((body as WithArrayBuffer).arrayBuffer) {
                // use it to convert our body to an array buffer
                body = await (body as WithArrayBuffer).arrayBuffer();
            }

            // if our body is an array buffer
            if (body instanceof ArrayBuffer) {
                // create a buffer from it if it isn't empty
                if (body.byteLength > 0) {
                    return Buffer.from(new Uint8Array(body));
                }
                // else, we can't create a buffer from an empty array
                return undefined;
            }

            // if we received a readable stream
            if (body instanceof ReadableStream) {
                // get a reader for our stream
                const reader = (body as ReadableStream).getReader();
                // loop our reader and store the stream into a new buffer
                const chunks = [];
                let finished = false;
                do {
                    const { done, value } = await reader.read();
                    finished = done;
                    chunks.push(Buffer.from(new Uint8Array(value)));
                } while (!finished);
                // return our new buffer
                return Buffer.concat(chunks);
            }

            // if our body is NOT a string
            if (typeof body !== 'string') {
                // attempt to stringify it using JSON
                try {
                    body = JSON.stringify(body);
                } catch (e) {
                    /* ignore errors */
                }
            }

            // if our body is still not a string
            if (typeof body !== 'string') {
                // attempt to stringify it using toString()
                try {
                    body = body.toString();
                } catch (e) {
                    /* ignore errors */
                }
            }

            // if our body is now a string
            if (typeof body === 'string') {
                // return a buffer from the string
                return Buffer.from(body);
            }

            // at this point, if we haven't identified our body yet,
            // we probably can't handle it
            throw new Error(
                `Unable to create buffer from body of type: ` +
                    `${body.constructor.name}`
            );
        } catch (e) {
            throw new Error(
                `Error creating buffer from body (${body.constructor.name}): ` +
                    `${e}`
            );
        }
    }

    async execute() {
        // time to execute our request
        // this log line fills in for the lack of a network log in our DevTools
        this.log.info(
            `Request: ${this.requestId} - ${this.reqObj.url}, `,
            this.reqObj,
            this.reqInit,
            this.body
        );

        // create a buffer from our body
        const bodyBuffer = await this.createBuffer(await this.body);
        // encode our body into a LOB packet
        const packet = encode(
            {
                reqObj: this.reqObj,
                reqInit: this.reqInit,
            },
            bodyBuffer
        );
        this.log.trace(
            `Request: ${this.requestId} - Encoded packet: ` +
                `${packet.toString('hex')}, `,
            packet
        );

        // create a new p2p request
        const p2pRequest = new P2pRequest(
            this.requestId,
            this.p2pClient,
            packet
        );
        // and execute it
        this.log.trace(`Request: ${this.requestId} - Executing p2p request`);
        const resp = (await p2pRequest.execute()) as Packet<{
            res: { headers: Record<string, unknown> | Headers } & Response;
            error: Error;
        }>;

        // if we didn't get back a response
        if (!resp?.json.res) {
            // there must have been an error
            throw resp?.json.error ?? new Error('No response found.');
        }
        // else, we successfully decoded, hydrate our headers
        resp.json.res.headers = new Headers(resp.json.res.headers);
        // create a new response to return
        const { body: tbody } = transformers.transformResponse({
            headers: resp.json.res.headers,
            body: resp.body,
            url: this.givenReqObj.url,
        });
        const response = new Response(tbody, resp.json.res);
        // this log line fills in for the lack of a network log in our DevTools
        this.log.info(`Request: ${this.requestId} - Response: `, response);
        return response;
    }
}
