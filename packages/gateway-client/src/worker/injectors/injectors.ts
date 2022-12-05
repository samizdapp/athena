class Injector {
    private injectors = new Set<CompiledInjector>();

    use(injector: CompiledInjector) {
        this.injectors.add(injector);
        return this;
    }

    inject(headers: Headers, body: Buffer): Buffer {
        for (const injector of this.injectors) {
            body = injector.inject(headers, body);
        }
        return body;
    }
}

export class CompiledInjector {
    constructor(
        private readonly content_type: string,
        private readonly split: string,
        private readonly snippet: string
    ) {}

    inject(headers: Headers, body: Buffer): Buffer {
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

export default new Injector();
