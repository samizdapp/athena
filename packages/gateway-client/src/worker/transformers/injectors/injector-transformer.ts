import { logger } from '../../logging';
import { AbstractTransformer } from '../transformers';

export class InjectorTransformer extends AbstractTransformer {
    private log = logger.getLogger('worker/transformer/compiled');

    private replacement: string;
    private addedLength = 0;

    constructor(
        private readonly contentType: string,
        private readonly match: RegExp,
        injection: {
            replacement: string;
            data: Record<string, string>;
        }
    ) {
        super();

        // transform replacement string
        this.replacement = injection.replacement.replaceAll(
            /\{\{[A-Za-z0-9_]*\}\}/g,
            match => {
                const key = match.slice(2, -2);
                return injection.data[key];
            }
        );
    }

    override transformResponse(res: Response): Response {
        // track how much length is added to our body
        this.addedLength = 0;
        // start by using parent transformer
        const transformedResponse = super.transformResponse(res);
        // if our body was NOT transformed
        if (!this.shouldTransformResponse(res)) {
            // just return our parent's transformation
            return transformedResponse;
        }

        // else, our headers won't have been correctly transformed
        // because they need to run after the body is transformed
        // transform them again
        const head = this.transformResponseHead(transformedResponse);
        return this.newResponse(
            head,
            transformedResponse.body as ReadableStream<Uint8Array>
        );
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

    override transformResponseChunk(
        _r: Response | Request,
        chunk: Uint8Array
    ): Uint8Array {
        // convert chunk to string
        const chunkString = new TextDecoder().decode(chunk);
        // if this chunk doesn't match
        if (!this.match.test(chunkString)) {
            // then we don't need to transform it
            return chunk;
        }
        // else, this chunk is a match, time to transform it
        const transformed = chunkString.replace(this.match, this.replacement);
        // track any length increase
        this.addedLength += transformed.length - chunkString.length;
        // return the transformed chunk
        return new TextEncoder().encode(transformed);
    }

    override transformResponseHead(res: Response): Response {
        // this will be first called before the body is transformed, and will
        // add zero to the length
        // it will be called a second time after our body is transformed, upon
        // which we will have a non-zero length
        const headers = new Headers(res.headers);
        const prevLen = headers.get('content-length') || '0';
        headers.set(
            'content-length',
            `${parseInt(prevLen) + this.addedLength}`
        );
        return this.replaceResponseHeaders(res, headers);
    }
}
