import { logger } from '../logging';

class Transformer {
    private transformers = new Set<AbstractTransformer>();

    use(transformer: AbstractTransformer) {
        this.transformers.add(transformer);
        return this;
    }

    transformResponse(res: Response): Response {
        for (const transformer of this.transformers) {
            res = transformer.transformResponse(res);
        }
        return res;
    }

    transformRequest(req: Request): Request {
        for (const transformer of this.transformers) {
            req = transformer.transformRequest(req);
        }
        return req;
    }

    protected async *readableStreamToAsyncIterator(stream: ReadableStream) {
        const reader = stream.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    return;
                }
                yield value;
            }
        } finally {
            reader.releaseLock();
        }
    }
}

enum ChunkType {
    REQUEST = 'Request',
    RESPONSE = 'Response',
}
abstract class AbstractTransformer {
    private chunkTransformers = {
        [ChunkType.REQUEST]: this.transformRequestChunk.bind(this),
        [ChunkType.RESPONSE]: this.transformResponseChunk.bind(this),
    };
    private transformBody(
        r: Request | Response,
        _type: ChunkType
    ): ReadableStream<Uint8Array> | undefined {
        if (!r.body) return undefined;

        const chunkTransformer = this.chunkTransformers[_type];
        const reader = r.body.getReader();
        const newbody = new ReadableStream({
            start(controller) {
                return pump();
                function pump() {
                    return reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close();
                            return;
                        }
                        controller.enqueue(chunkTransformer(r, value));
                        pump();
                    });
                }
            },
        });

        return newbody;
    }

    transformRequest(req: Request): Request {
        //console.log('transformRequest', req);
        // check if the request is correct type
        if (this.shouldTransformRequest(req)) {
            const head = this.transformRequestHead(req);
            // console.log(
            //     'transformRequest',
            //     head,
            //     Array.from(head.headers.entries())
            // );
            const body = this.transformBody(req, ChunkType.REQUEST);
            return this.newRequest(head, body as ReadableStream<Uint8Array>);
        }
        return req;
    }

    abstract shouldTransformRequest(req: Request): boolean;
    abstract transformRequestHead(res: Request): Request;
    abstract transformRequestChunk(
        res: Request | Response,
        chunk: Uint8Array
    ): Uint8Array;

    abstract shouldTransformResponse(req: Response): boolean;
    abstract transformResponseHead(req: Response): Response;
    abstract transformResponseChunk(
        req: Response | Request,
        chunk: Uint8Array
    ): Uint8Array;

    transformResponse(res: Response): Response {
        //console.log('transformResponse', res);
        // check if the response is correct type
        if (this.shouldTransformResponse(res)) {
            const head = this.transformResponseHead(res);
            const body = this.transformBody(res, ChunkType.RESPONSE);
            return this.newResponse(head, body as ReadableStream<Uint8Array>);
        }
        return res;
    }

    protected newResponse(res: Response, body: ReadableStream<Uint8Array>) {
        return Object.defineProperties(new Response(body, res), {
            url: {
                get: () => res.url,
            },
            redirected: {
                get: () => res.redirected,
            },
            type: {
                get: () => res.type,
            },
        });
    }

    protected newRequest(req: Request, body: ReadableStream<Uint8Array>) {
        //console.log('newRequest', req, body, Array.from(req.headers.entries()));

        return Object.defineProperties(
            new Request(req.url, {
                headers: req.headers,
                method: req.method,
                mode: req.mode !== 'navigate' ? req.mode : 'same-origin',
                credentials: req.credentials,
                cache: req.cache,
                redirect: req.redirect,
                referrer: req.referrer,
                integrity: req.integrity,
            }),
            {
                headers: {
                    get: () => req.headers,
                    configurable: true,
                },
                body: {
                    get: () => body,
                },
                destination: {
                    get: () => req.destination,
                },
            }
        );
    }

    protected newUrlRequest(url: string, req: Request) {
        const request = new Request(url, {
            headers: req.headers,
            method: req.method,
            mode: req.mode,
            credentials: req.credentials,
            cache: req.cache,
            redirect: req.redirect,
            referrer: req.referrer,
            integrity: req.integrity,
        });
        Object.defineProperty(request, 'body', {
            get: () => req.body,
        });
        //console.log('newRequest', url, req, request);
        return request;
    }

    protected replaceRequestHeaders(req: Request, headers: Headers) {
        // create a new request with the modified headers, omitting the body if GET/HEAD

        const request = this.newRequest(
            req,
            req.body as ReadableStream<Uint8Array>
        );

        Object.defineProperty(request, 'headers', {
            get: () => headers,
        });

        //console.log(
        //     'replaceRequestHeaders',
        //     Array.from(req.headers.entries()),
        //     Array.from(headers.entries()),
        //     Array.from(request.headers.entries())
        // );

        return request;
    }

    protected replaceResponseHeaders(res: Response, headers: Headers) {
        // create a new response with the modified headers, omitting the body if HEAD
        const response = this.newResponse(
            {
                status: res.status,
                statusText: res.statusText,
                headers,
                url: res.url,
                redirected: res.redirected,
                type: res.type,
            } as Response,
            res.body as ReadableStream<Uint8Array>
        );

        //console.log('replaceResponseHeaders', res, headers, response);

        return response;
    }

    private async *readableStreamToAsyncIterator(
        readableStream: ReadableStream<Uint8Array>
    ) {
        const reader = readableStream?.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            yield value;
        }
    }
}

export class BaseTransformer extends AbstractTransformer {
    shouldTransformRequest(_req: Request): boolean {
        return false;
    }

    transformRequestHead(res: Request): Request {
        return res;
    }

    transformRequestChunk(_r: Request, chunk: Uint8Array): Uint8Array {
        return chunk;
    }

    shouldTransformResponse(_res: Response): boolean {
        return false;
    }

    transformResponseHead(res: Response): Response {
        return res;
    }

    transformResponseChunk(_r: Response, chunk: Uint8Array): Uint8Array {
        return chunk;
    }
}

export class CompiledTransformer extends BaseTransformer {
    protected log = logger.getLogger('worker/transformer/compiled');

    constructor(
        protected readonly contentType: string,
        protected readonly split: string,
        protected readonly snippet: string
    ) {
        super();
    }

    override transformResponseChunk(
        _r: Response | Request,
        chunk: Uint8Array
    ): Uint8Array {
        const [start, end] = chunk.toString().split(this.split);
        // check if the response contains the split tag
        this.log.trace('has start && end?', start && end, this.split);
        if (start && end) {
            const parts = [start, this.split, this.snippet, end];
            return Buffer.from(parts.join(''));
        }
        return chunk;
    }

    override shouldTransformResponse(res: Response): boolean {
        this.log.trace(
            'shouldTransformResponse?',
            res.headers.get('content-type'),
            this.contentType
        );
        return (
            res.headers.get('content-type')?.startsWith(this.contentType) ||
            false
        );
    }

    override transformResponseHead(res: Response): Response {
        const headers = new Headers(res.headers);
        const prevLen = headers.get('content-length') || '0';
        headers.set(
            'content-length',
            `${parseInt(prevLen) + this.snippet.length}`
        );
        return this.replaceResponseHeaders(res, headers);
    }
}

export default new Transformer();
