import { getVersion } from './version';

const KEY_PREFIX = '/smz/worker';

export enum CACHE_NAME {
    ROOT = 'root',
    APP = 'app',
}

const cacheHandlers: Record<CACHE_NAME, { name: string; matchAll: RegExp }> = {
    [CACHE_NAME.ROOT]: {
        name: CACHE_NAME.ROOT,
        matchAll: new RegExp(`^${KEY_PREFIX}/${CACHE_NAME.ROOT}`),
    },
    [CACHE_NAME.APP]: {
        name: `${CACHE_NAME.APP}/${getVersion().app?.build}`,
        matchAll: new RegExp(`^${KEY_PREFIX}/${CACHE_NAME.APP}`),
    },
};

const getCacheKey = (name: CACHE_NAME) => {
    return `${KEY_PREFIX}/${cacheHandlers[name].name}`;
};

export const openCache = async (name: CACHE_NAME) => {
    return caches.open(getCacheKey(name));
};

export const clearExpiredCaches = async (name: CACHE_NAME) => {
    // use our newest key to get a list of all expired keys for our cache
    const allKeys = await caches.keys();
    const newestKey = getCacheKey(name);
    // delete all expired keys
    return Promise.all(
        allKeys
            .filter(
                key =>
                    cacheHandlers[name].matchAll.test(key) && key !== newestKey
            )
            .map(key => caches.delete(key))
    );
};
