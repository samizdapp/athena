import {
    AbstractTransformer,
    CompiledTransformer,
    SamizdappResponse,
} from './transformers';
import { logger } from '../logging';

class BasePathTransformer extends AbstractTransformer {
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

    override transformResponse({
        headers,
        body,
        url,
    }: SamizdappResponse): SamizdappResponse {
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
            const injector = new CompiledTransformer(
                this.content_type,
                '<head>',
                makeSnippet(targetHeader, url)
            );

            // inject the new base tag into the body
            return injector.transformResponse({
                headers,
                body: Buffer.from(newBody),
                url,
            });
        }
        return { url, body, headers };
    }

    override transformRequest(req: { duplex?: string } & Request): Request {
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

export default new BasePathTransformer();

const makeSnippet = (basePath: string, url: string) => `
<base href="${url}">
<script>;
const BASE_PATH = '${basePath}';

function makeUpdateCallback(link) {
    return () => {
        const href = link.getAttribute('href');
        console.log('checking link', href);
        if (href && href.startsWith('http')) {
            console.log('link is http');
            const url = new URL(href);
            console.log('url', url);
            if (
                url.host !== location.host &&
                (url.hostname.endsWith('.localhost') ||
                    ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(
                        url.hostname
                    )) &&
                !url.pathname.startsWith(BASE_PATH)
            ) {
                let basePath = BASE_PATH;
                if (
                    url.port &&
                    !['80', '443', location.port].includes(url.port)
                ) {
                    console.log('adding port', url.port);
                    basePath = \`\${basePath}/\${url.port}\`;
                }

                url.host = location.host;
                url.pathname = \`\${basePath}\${url.pathname}\`;
                console.log('new url', url);
                link.setAttribute('href', url.toString());
            }
        } else if (href && href.startsWith('/') && !href.startsWith(BASE_PATH)) {
            console.log('link is relative');
            link.setAttribute('href', \`\${BASE_PATH}\${href}\`);
        }
    };
}

async function waitFor(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

async function updateLinks() {
    const linkSet = new Set();
    let timeout = 1;
    while (true) {
        const links = Array.from(document.querySelectorAll('a'));
        for (const link of links) {
            if (linkSet.has(link)) {
                continue;
            }
            linkSet.add(link);
            const updateLink = makeUpdateCallback(link);
            updateLink();
            const observer = new MutationObserver(updateLink);
            observer.observe(link, {
                attributes: true,
                attributeFilter: ['href'],
            });
        }

        await waitFor(timeout);
        timeout = Math.min(1000, timeout + 50);
    }
}
updateLinks();
</script>
`;