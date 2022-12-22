import environment from '../../environment';
import { AbstractTransformer } from './transformers';

export class CaddyHostTransformer extends AbstractTransformer {
    override shouldTransformRequest(req: Request): boolean {
        const url = new URL(req.url);
        return url.host === self.location.host && environment.CADDY_ROOT
            ? true
            : false;
    }

    override transformRequestHead(req: Request): Request {
        const url = new URL(req.url);
        const newUrl = url
            .toString()
            .replace(url.origin, environment.CADDY_ROOT);
        return this.newUrlRequest(newUrl, req);
    }
}

export default new CaddyHostTransformer();
