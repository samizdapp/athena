import { AbstractTransjector, CompiledInjector } from './injectors';
import { logger } from '../logging';

class BasePathTransjector extends AbstractTransjector {
    protected log = logger.getLogger('worker/transjectors/base-path');
    private readonly content_type = 'text/html';
    private readonly header = 'x-samizdapp-base-path';

    constructor() {
        super();
        this.log.trace('constructor, ', this);
    }

    private referrerMap: Map<string, string> = new Map();
    private portMap: Map<number, string> = new Map();

    private hasSeenReferrer(url: string): boolean {
        return this.referrerMap.has(url);
    }

    private getSeenReferrer(url: string): string {
        return this.referrerMap.get(url) || '';
    }

    private hasSeenPort(url: string) {
        const port = new URL(url).port;
        if (!port) return false;
        return this.portMap.has(parseInt(port));
    }

    private getSeenPort(url: string) {
        const port = new URL(url).port;
        if (!port) return '';
        return this.portMap.get(parseInt(port)) || '';
    }

    private hostIsLocal(url: string, referrer: string): boolean {
        const host = new URL(url).hostname;
        let referrerHost;
        try {
            referrerHost = new URL(referrer).hostname;
        } catch (e) {
            this.log.trace('ignoring invalid referrer: ', referrer);
        }
        return [
            referrerHost,
            'localhost',
            '127.0.0.1',
            '::1',
            '0.0.0.0',
        ].includes(host);
    }

    override inject(headers: Headers, body: Buffer, url: string): Buffer {
        const contentType = headers.get('content-type');
        const targetHeaderRaw = headers.get(this.header);
        const [targetHeader, ...ports] = targetHeaderRaw?.split(',') || [];

        this.log.trace(
            `contentType(${this.content_type}): ${contentType}, targetHeader(${this.header}): ${targetHeader}, url: ${url} `
        );
        if (
            contentType?.startsWith(this.content_type) &&
            headers.get(this.header)
        ) {
            // get url string without query params or hash
            const _url = new URL(url);
            _url.search = '';
            _url.hash = '';
            url = _url.toString();

            this.log.debug(`injecting base path into: ${url}`);
            this.referrerMap.set(url, targetHeader);
            for (const port of ports) {
                this.portMap.set(parseInt(port), `${targetHeader}/${port}`);
            }

            // remove the first <base> tag in the body via regex
            const newBody = body.toString().replace(/<base[^>]*>/, '');
            // make a new compiled injector with the base path
            const injector = new CompiledInjector(
                this.content_type,
                '<head>',
                `<base href="${url}">`
            );

            // inject the new base tag into the body
            return injector.inject(headers, Buffer.from(newBody), url);
        }
        return body;
    }

    override transform(req: { duplex?: string } & Request): Request {
        // get the host of the url and of the referrer
        const url = new URL(req.url);
        const hasSeenReferrer = this.hasSeenReferrer(req.referrer);
        const hasSeenPort = this.hasSeenPort(req.url);
        const hostIsLocal = this.hostIsLocal(req.url, req.referrer);

        this.log.trace(
            `url: ${url}, hostIsLocal: ${hostIsLocal}, hasSeenReferrer: ${hasSeenReferrer}, hasSeenPort: ${hasSeenPort}`
        );

        if (hostIsLocal && (hasSeenReferrer || hasSeenPort)) {
            this.log.debug(`transforming request: ${req.url}`);
            const basePath = hasSeenPort
                ? this.getSeenPort(req.url)
                : this.getSeenReferrer(req.referrer);

            const newUrl = new URL(req.url);
            if (newUrl.pathname.startsWith(basePath)) {
                this.log.debug('url already contains basePath, skipping');
                return req;
            }

            newUrl.pathname = basePath + newUrl.pathname;
            newUrl.port = '80';
            newUrl.protocol = 'http:';
            newUrl.hostname = 'localhost';
            this.log.debug('new url: ' + newUrl.toString());

            // construct a new request with the new url
            try {
                req.duplex = 'half';
                return new Request(newUrl.toString(), req);
            } catch (e) {
                this.log.error('error constructing new request: ', e);
                this.log.error('original request: ', req.clone());
            }
        }

        return req;
    }
}

export default new BasePathTransjector();
