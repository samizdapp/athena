export type SamizdappResponse = {
    url: string;
    headers: Headers;
    body: Buffer;
};

class Transformer {
    private transformers = new Set<AbstractTransformer>();

    use(transformer: AbstractTransformer) {
        this.transformers.add(transformer);
        return this;
    }

    transformResponse(res: SamizdappResponse): SamizdappResponse {
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
}

export class AbstractTransformer {
    transformResponse(res: SamizdappResponse): SamizdappResponse {
        return res;
    }
    transformRequest(req: Request): Request {
        return req;
    }
}

export class CompiledTransformer extends AbstractTransformer {
    constructor(
        protected readonly content_type: string,
        protected readonly split: string,
        protected readonly snippet: string
    ) {
        super();
    }

    override transformResponse({
        headers,
        body,
        url,
    }: SamizdappResponse): SamizdappResponse {
        // check if the response is correct type
        if (headers.get('content-type')?.startsWith(this.content_type)) {
            const [start, end] = body.toString().split(this.split);
            // check if the response contains the split tag
            if (start && end) {
                const parts = [start, this.split, this.snippet, end];
                const newBody = Buffer.from(parts.join(''));
                // update the headers to have the correct content-length
                headers.set('content-length', newBody.byteLength.toString());
                return { headers, body: newBody, url };
            }
        }

        // if the response is not correct type or does not contain the split tag, return the original body
        return { headers, body, url };
    }
}

export default new Transformer();
