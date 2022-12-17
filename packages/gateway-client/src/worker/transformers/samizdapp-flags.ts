import { AbstractTransformer } from './transformers';

export class SamizdappFlagTransformer extends AbstractTransformer {
    constructor(
        protected readonly prefix: string,
        protected readonly inject: string,
        protected readonly invert: boolean = false
    ) {
        super();
    }

    override shouldTransformRequest(res: Request): boolean {
        const url = new URL(res.url);
        const match = url.pathname.startsWith(this.prefix);
        const shouldTransformRequest = this.invert ? !match : match;
        return shouldTransformRequest;
    }

    override transformRequestHead(req: Request): Request {
        const headers = new Headers(req.headers);
        headers.set('x-intercepted-subdomain', this.inject);
        return this.replaceRequestHeaders(req, headers);
    }
}
