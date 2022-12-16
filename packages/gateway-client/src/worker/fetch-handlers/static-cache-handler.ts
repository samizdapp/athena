import { CACHE_NAME, openCache } from '../cache';
import { logger } from '../logging';
import { Handler } from './fetch-handlers';

const log = logger.getLogger('worker/fetch/static-cache-handler');

export const staticCacheHandler: Handler = (request, respondWith) => {
    // Check if this is a request for a static asset
    log.trace('Destination: ', request.destination, request);

    // only handle static assets
    if (
        ![
            'audio',
            'audioworklet',
            'document',
            'font',
            'image',
            'paintworklet',
            'report',
            'script',
            'style',
            'track',
            'video',
            'xslt',
        ].includes(request.destination) &&
        // this directory doesn't have a usable destination string, but it's static assets
        !request.url.includes('/packs/icons/')
    ) {
        return;
    }

    // don't cache when running locally
    if (process.env.NX_LOCAL === 'true') {
        return;
    }

    // respond with asset from either cache or fetch
    respondWith(
        openCache(CACHE_NAME.APP).then(cache => {
            // Go to the cache first
            return cache.match(request.url).then(cachedResponse => {
                // Return a cached response if we have one
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Otherwise, hit the network
                return fetch(request).then(fetchedResponse => {
                    // Add the network response to the cache for later visits
                    cache.put(request, fetchedResponse.clone());

                    // Return the network response
                    return fetchedResponse;
                });
            });
        })
    );
};

export default staticCacheHandler;
