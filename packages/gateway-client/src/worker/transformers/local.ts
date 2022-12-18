import { AbstractTransformer } from './transformers';

export class LocalPortTransformer extends AbstractTransformer {
    override shouldTransformRequest(req: Request): boolean {
        const url = new URL(req.url);
        return url.hostname === 'localhost';
    }

    override transformRequestHead(req: Request): Request {
        const url = new URL(req.url);
        if (url.port !== '80') {
            url.port = '80';
            return this.newUrlRequest(url.toString(), req);
        }
        return req;
    }
}

export default new LocalPortTransformer();
