import { logger } from './logging';

const log = logger.getLogger('worker/update-app');

const rootWorkerCache = '/smz/worker/root';
const appWorkerUrl = 'worker-app.js';
const currentAppKey = appWorkerUrl.replace('.js', '-current.js');
const newAppKey = appWorkerUrl.replace('.js', '-new.js');

export const updateAppWorker = async () => {
    log.debug('Checking for app worker updates...');
    // open root worker cache
    const cache = await caches.open(rootWorkerCache);
    // get cached response for comparison
    const cachedResponse =
        (await cache.match(newAppKey)) ?? (await cache.match(currentAppKey));
    const cachedScript = (await cachedResponse?.text()) ?? '';

    // fetch updated script
    const response = await fetch(new Request(appWorkerUrl));
    const responseToCache = response.clone();
    const newScript = await response.text();

    // if the scripts have changed
    if (newScript !== cachedScript) {
        // update the cache
        await cache.put(newAppKey, responseToCache);
        // the next time the root worker is executed,
        // it will load the updated version of our app worker
        log.info(`Updated app worker at: ${appWorkerUrl}`);
    }
};

export default updateAppWorker;
