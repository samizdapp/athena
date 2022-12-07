class Transjector {
    private injectors = new Set<AbstractTransjector>();

    use(injector: AbstractTransjector) {
        this.injectors.add(injector);
        return this;
    }

    inject(headers: Headers, body: Buffer, url: string): Buffer {
        for (const injector of this.injectors) {
            body = injector.inject(headers, body, url);
        }
        return body;
    }

    transform(req: Request): Request {
        for (const injector of this.injectors) {
            req = injector.transform(req);
        }
        return req;
    }
}

export class AbstractTransjector {
    inject(_headers: Headers, body: Buffer, _url: string): Buffer {
        return body;
    }
    transform(req: Request): Request {
        return req;
    }
}

export class CompiledInjector extends AbstractTransjector {
    constructor(
        protected readonly content_type: string,
        protected readonly split: string,
        protected readonly snippet: string
    ) {
        super();
    }

    override inject(headers: Headers, body: Buffer, _url: string): Buffer {
        // check if the response is correct type
        if (headers.get('content-type')?.startsWith(this.content_type)) {
            const [start, end] = body.toString().split(this.split);
            // check if the response contains the split tag
            if (start && end) {
                const parts = [start, this.split, this.snippet, end];
                const newBody = Buffer.from(parts.join(''));
                // update the headers to have the correct content-length
                headers.set('content-length', newBody.byteLength.toString());
                return newBody;
            }
        }

        // if the response is not correct type or does not contain the split tag, return the original body
        return body;
    }
}

export default new Transjector();
