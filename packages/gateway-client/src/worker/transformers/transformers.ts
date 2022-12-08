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
    abstract transformChunk(chunk: Uint8Array): Uint8Array;

    private transform(
        r: Request | Response,
        type: ChunkType
    ): ReadableStream<Uint8Array> {
        return new ReadableStream({
            start: async controller => {
                const chunks = await this.readableStreamToAsyncIterator(
                    r.body!
                );
                for await (const chunk of chunks) {
                    controller.enqueue(
                        this.chunkTransformers[type](
                            r as unknown as Request & Response,
                            chunk
                        )
                    );
                }
            },
        });
    }

    transformRequest(req: Request): Request {
        // check if the request is correct type
        if (this.shouldTransformRequest(req)) {
            const head = this.transformRequestHead(req);
            const body = this.transform(req, ChunkType.REQUEST);
            return new Request(head, { body });
        }
        return req;
    }

    abstract shouldTransformRequest(req: Request): boolean;
    abstract transformRequestHead(res: Request): Request;
    abstract transformRequestChunk(res: Request, chunk: Uint8Array): Uint8Array;

    abstract shouldTransformResponse(req: Response): boolean;
    abstract transformResponseHead(req: Response): Response;
    abstract transformResponseChunk(
        req: Response,
        chunk: Uint8Array
    ): Uint8Array;

    transformResponse(res: Response): Response {
        // check if the response is correct type
        if (this.shouldTransformResponse(res)) {
            const head = this.transformResponseHead(res);
            const body = this.transform(res, ChunkType.RESPONSE);
            return new Response(body, head);
        }
        return res;
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
    transformChunk(chunk: Uint8Array): Uint8Array {
        return chunk;
    }

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
    constructor(
        protected readonly content_type: string,
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
        if (start && end) {
            const parts = [start, this.split, this.snippet, end];
            return Buffer.from(parts.join(''));
        }
        return chunk;
    }

    override shouldTransformResponse(res: Response): boolean {
        return (
            res.headers.get('content-type')?.startsWith(this.content_type) ||
            false
        );
    }
}

export default new Transformer();
