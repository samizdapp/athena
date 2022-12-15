import { levels } from 'loglevel';
import { ClientMessageType } from '../worker-messaging';
import { logger } from './logging';
import messenger from './messenger';
import { getVersion } from './version';

declare const self: ServiceWorkerGlobalScope;

const log = logger.getLogger('worker/update-app');

// abort attempt to fetch updated script after 1 minute
const updateFetchTimeout = 1 * 60 * 1000;
const rootWorkerCache = '/smz/worker/root';
const appWorkerUrl =
    `${new URL('.', self.location.href).pathname.slice(0, -1)}` +
    `/worker-app.js`;
const currentAppKey = appWorkerUrl.replace('.js', '-current.js');
const newAppKey = appWorkerUrl.replace('.js', '-new.js');
const currentVersionAppKey = appWorkerUrl.replace(
    '.js',
    `-${getVersion().app?.build}.js`
);
const rollbackKey = appWorkerUrl.replace(
    '.js',
    `-rollback-${getVersion().app?.build}.js`
);

type CacheOptions = {
    rootCache?: Cache;
};

enum Channel {
    CURRENT = 'CURRENT',
    ROLLBACK = 'ROLLBACK',
}

const newWorkerExists = () =>
    self.registration.installing || self.registration.waiting;

const extractVersion = (key: string | undefined, regex: RegExp) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    key ? parseInt(key.match(regex)![1]) : Infinity;

const channelHandlers: Record<
    Channel,
    {
        regex: RegExp;
        createPostFilter: (
            options: Required<CacheOptions>
        ) => Promise<(versionKey: string) => boolean>;
    }
> = {
    CURRENT: {
        regex: new RegExp(appWorkerUrl.replace('.js', '-([0-9]+).js')),
        createPostFilter: async ({ rootCache }) => {
            const oldestRollbackKey = (
                await listVersions({
                    rootCache,
                    channel: Channel.ROLLBACK,
                })
            ).slice(-1)[0];
            const oldestRollbackVersion = extractVersion(
                oldestRollbackKey,
                channelHandlers.ROLLBACK.regex
            );
            return (versionKey: string) =>
                extractVersion(versionKey, channelHandlers.CURRENT.regex) <
                oldestRollbackVersion;
        },
    },
    ROLLBACK: {
        regex: new RegExp(appWorkerUrl.replace('.js', '-rollback-([0-9]+).js')),
        createPostFilter: async () => {
            const currentVersion = getVersion().app?.build ?? Infinity;
            return (versionKey: string) =>
                extractVersion(versionKey, channelHandlers.ROLLBACK.regex) >=
                currentVersion;
        },
    },
};

const getCacheKeys = async (cache: Cache) =>
    (await cache.keys()).map(key => new URL(key.url).pathname);

const getFilteredCacheKeys = async (cache: Cache, regex: RegExp) =>
    (await getCacheKeys(cache)).filter(key => regex.test(key));

const listVersions = async ({
    channel = Channel.CURRENT,
    rootCache,
}: { channel?: Channel } & CacheOptions = {}) => {
    const { regex, createPostFilter } = channelHandlers[channel];
    // open root worker cache
    const cache = rootCache ?? (await caches.open(rootWorkerCache));
    const postFilter = await createPostFilter({ rootCache: cache });
    // return our keys sorted by version
    return (await getFilteredCacheKeys(cache, regex))
        .sort((a, b) => extractVersion(b, regex) - extractVersion(a, regex))
        .filter(postFilter);
};

const getCachedScript = async (
    cacheKey: string,
    { rootCache }: CacheOptions = {}
) => {
    // open root worker cache
    const cache = rootCache ?? (await caches.open(rootWorkerCache));
    // get cached response
    const response = await cache.match(cacheKey);
    // parse script from response
    return {
        response,
        script: (await response?.text()) ?? '',
    };
};

/**
 * Handles rollback logic for our worker.
 *
 * Will attempt to roll back to the most recent previous version while skipping
 * any versions that were previously rolled back from.
 *
 * Only one rollback can be done at a time. In order to do a second rollback,
 * the first must first be consumed by the root worker on the next restart.
 *
 * @param {Object} options
 * @param {Cache} [options.rootCache] - root worker cache
 * @returns {Promise<void>} - resolves when rollback is complete
 *
 */
const rollbackAppWorker = async ({ rootCache }: CacheOptions = {}) => {
    // It is possible that a new worker is waiting to activate.
    // Our rollback logic makes certain assumptions around us being the only
    // ones that are modifying the cache, which isn't true if there is another
    // worker running.
    // Any rollbacks will be declined until the new worker becomes active.
    if (newWorkerExists()) {
        log.info('New worker waiting to activate, declining to rollback.');
        return;
    }
    log.info('Rolling back app worker...');
    // open root worker cache
    const cache = rootCache ?? (await caches.open(rootWorkerCache));

    // if we've already rolled back our current version
    const existingRollback = await cache.match(rollbackKey);
    if (existingRollback) {
        // we can only roll back one version at a time
        // we'll need to wait for the rolled back version to load next restart
        // before we can roll back again
        log.debug('Declining to roll back: pending rollback');
        return;
    } // else, we haven't rolled back our current version yet

    // get a list of all versions that we've previously rolled back from
    const rollbackKeys = await getFilteredCacheKeys(
        cache,
        channelHandlers.ROLLBACK.regex
    );
    // find a previous version that we haven't rolled back from previously
    const previousVersion = (await listVersions({ rootCache: cache }))
        .slice(1)
        .find(
            key =>
                !rollbackKeys.includes(
                    appWorkerUrl.replace(
                        '.js',
                        `-rollback-${extractVersion(
                            key,
                            channelHandlers.CURRENT.regex
                        )}.js`
                    )
                )
        );
    // roll back to our previous version
    const previousVersionCache = await cache.match(previousVersion ?? '');
    const currentCache = await cache.match(currentAppKey);
    if (currentCache && previousVersionCache) {
        // store our current version as a rolled back version
        // this will be used in a few places to mark this version as a version
        // we rolled back from
        await cache.put(rollbackKey, currentCache.clone());
        // our previous version now becomes a new script (just like an updated
        // script would)
        // it will be consumed by the root worker on our next restart
        await cache.put(newAppKey, previousVersionCache.clone());
        log.debug('Worker rolled back.');
    }
};

/**
 * Main entrypoint for updating the app worker.
 *
 * - Maintains a version history
 * - Rolls back to previous version if update fails
 * - Will not override rollback with update unless `ignoreRollback` is true
 *
 * @param {Object} options
 * @param {Cache} [options.rootCache] - root worker cache
 * @param {boolean} [options.ignoreRollback] - if true, will update to a
 *      version that was previously rolled back from
 * @returns {Promise<void>} - resolves when update is complete
 *
 */
export const updateAppWorker = async ({
    rootCache,
    ignoreRollback = false,
}: { ignoreRollback?: boolean } & CacheOptions = {}) => {
    // It is possible that a new worker is waiting to activate.
    // Our update logic makes certain assumptions around us being the only
    // ones that are modifying the cache, which isn't true if there is another
    // worker running.
    // Any updates will be declined until the new worker becomes active.
    if (newWorkerExists()) {
        log.info('New worker waiting to activate, declining to update.');
        return;
    }
    log.debug('Checking for app worker updates...');
    // open root worker cache
    const cache = rootCache ?? (await caches.open(rootWorkerCache));

    // fetch the following cached scripts
    // (the script that we fetch will be compared against them)
    // our current script
    const { script: currentScript } = await getCachedScript(currentAppKey, {
        rootCache: cache,
    });
    // a possible new script -
    //   an update that the root worker has not consumed yet
    const { script: newScript } = await getCachedScript(newAppKey, {
        rootCache: cache,
    });
    // a possible rolled back script (the most recent one) - either:
    // - a script that is newer than our current script,
    //      that we've rolled back from
    // - a script that is the same as our current script,
    //      that we're *going to* rollback from
    //      (not consumed by the root worker yet)
    const latestRollbackKey = (
        await listVersions({ channel: Channel.ROLLBACK, rootCache: cache })
    )[0];
    const { script: rolledBackScript } = await getCachedScript(
        latestRollbackKey,
        { rootCache: cache }
    );

    // log our results
    if (log.getLevel() === levels.TRACE) {
        log.trace(
            `Retrieved current script: ${(
                new TextEncoder().encode(currentScript).length /
                (1024 * 1024)
            ).toFixed(1)} MB`
        );
        log.trace(
            `Retrieved new script: ${(
                new TextEncoder().encode(newScript).length /
                (1024 * 1024)
            ).toFixed(1)} MB`
        );
        log.trace(
            `Retrieved rolled back script: ${(
                new TextEncoder().encode(rolledBackScript).length /
                (1024 * 1024)
            ).toFixed(1)} MB`
        );
    }

    // attempt to fetch updated script (abort after configured timeout)
    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), updateFetchTimeout);
    let response;
    try {
        const originalResponse = await fetch(new Request(appWorkerUrl), {
            signal: abortController.signal,
        });
        // generate an id for this response
        // this id will be used by the root service worker to iterate
        // through our version history using simpler logic
        const headers = new Headers(originalResponse.headers);
        headers.set('X-Smz-Worker-App-Script-Id', self.crypto.randomUUID());
        response = new Response(originalResponse.body, {
            headers,
            status: originalResponse.status,
            statusText: originalResponse.statusText,
        });
    } catch (e) {
        // something caused our fetch request to fail
        log.error('Failed to fetch app worker: ', e);

        /*
         * This could be caused by a bug in the current version of our app.
         *
         * In the event of such a bug, our app would be unable to update itself
         * with a fix unless we first roll back to a previous version.
         *
         * However, we'll only want to attempt this once, as there are many
         * reasons why the above fetch attempt could fail (many of which have
         * nothing to do with the current version of our app).
         *
         * We'll also only want to roll back if we don't already have a new
         * script. If we *do* have a new script, we should instead wait for it
         * to take effect as it will hopefully fix this possible bug.
         *
         * The end result of this is that we'll often needlessly roll back a
         * single version in the event of the client being offline or the box
         * being down.
         *
         */

        // if we have a new script
        if (newScript) {
            // we already have an update we can try applying
            log.debug('Declining to roll back: pending update.');
            // we can safely finish this update attempt
            return;
        }

        // if we have already rolled back at least once
        if (latestRollbackKey) {
            // we've already rolled back once, we shouldn't do it again
            log.debug('Declining to roll back: existing rollback.');
            // our update attempt is at an end
            return;
        }

        // attempt to perform a rollback
        // try doing so now
        log.info('Attempting to roll back worker...');
        await rollbackAppWorker({ rootCache: cache });

        /*
         * If the rollback is successful, it will take effect the next time
         * we restart. This gives us time to successfully fetch the update
         * and prevent the rollback from taking effect.
         *
         */

        // nothing more to do for now
        return;
    }

    // if we've made it this far, our fetch request was successful
    // parse the potentially updated script from response
    // (clone the response first so that we can cache it later)
    const updatedResponse = response.clone();
    const updatedScript = await response.text();

    // Now, we need to determine if this updated script is actually different
    // from what we currently have.
    // First, ensure it is different than our current script
    // (remember that it is possible that our new script is actually a rolled
    // back previous version).)
    // Second, ensure it is different from our new script (our new script may
    // be this same update that we've already fetched).
    const existingScripts = [currentScript, newScript];
    // Third, ensure it is different from our
    // most up-to-date rolled back script. If we are currently rolled back, our
    // update attempt would otherwise simply fetch the script we just rolled
    // back from, which would of course be different than our current script.
    // Optionally, `ignoreRollback` does this exact thing, so only compare
    // against our rolled back script if `ignoreRollback` is false.
    if (!ignoreRollback) {
        existingScripts.push(rolledBackScript);
    }
    // If there is in fact a pending rollback that we are to ignore,
    // then we don't want to check for differences against the current script
    // because we actually want an update that is the same as the current
    // script to override our rollback.
    else if (rolledBackScript && newScript) {
        existingScripts.splice(existingScripts.indexOf(currentScript), 1);
    }
    // if this updated script matches any of our above scripts
    if (existingScripts.includes(updatedScript)) {
        // then it isn't actually an update
        log.debug('App worker is up to date');
        // nothing more to do
        return;
    } // else, our updated script *is* in fact an update

    // the updated script will become our new script
    // the next time the root worker is executed,
    // it will load the updated version of our app worker by
    // consuming the new script
    await cache.put(newAppKey, updatedResponse);
    // since we *are* successfully updating from this version, we'll want to
    // ensure that it isn't marked as a rollback
    await cache.delete(rollbackKey);
    // if our updated script is the same as our rolled back script,
    // that means that we have a rollback that we are choosing to ignore
    // we should delete the key for this rollback so that we don't think it is
    // a pending rollback
    if (rolledBackScript === updatedScript) {
        await cache.delete(latestRollbackKey);
    }
    log.info(`Updated app worker at: ${appWorkerUrl}`);
};

export const initUpdates = async ({ rootCache }: CacheOptions = {}) => {
    // open root worker cache
    const cache = rootCache ?? (await caches.open(rootWorkerCache));

    // get our current version
    const currentCache = await cache.match(currentAppKey);
    // store our current script in our version history
    // if we already have a current version key in our cache,
    // override it; this serves as a repair mechanism in the event that
    // the version history gets corrupted somehow
    if (currentCache) {
        log.debug('Updating cache pointer: ', currentVersionAppKey);
        await cache.put(currentVersionAppKey, currentCache.clone());
    }

    // listen for update command
    messenger.addListener(ClientMessageType.UPDATE_WORKER, () => {
        updateAppWorker({ rootCache: cache, ignoreRollback: true });
    });

    // listen for rollback command
    messenger.addListener(ClientMessageType.ROLLBACK_WORKER, () => {
        rollbackAppWorker({ rootCache: cache });
    });
};
