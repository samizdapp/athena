// The workbox-precaching import includes a type definition for
// <self dot __WB_MANIFEST>.
// Import it even though we're not using any of the imports,
import type * as _ from 'workbox-precaching';
import type { WorkerVersionManifest } from '../worker-messaging';

declare const self: {
    version: WorkerVersionManifest;
} & ServiceWorkerGlobalScope;

// if version not initialized
if (!self.version) {
    self.version = {
        root: {},
    };
}

self.version.root = {
    version: '0.1.0',
    build: process.env.NX_BUILD_NUMBER,
    branch: process.env.NX_BUILD_BRANCH,
    commit: process.env.NX_BUILD_COMMIT,
};

type LogKey = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';
const logKeys: LogKey[] = ['error', 'warn', 'log', 'info', 'debug', 'trace'];
const logger = Object.fromEntries(
    logKeys.map(key => [
        key,
        (...args: unknown[]) => {
            console[key]('[ROOT WORKER]', ...args);
        },
    ])
) as Record<LogKey, (...args: unknown[]) => void>;

logger.info('Executing root worker...');

const appWorkerUrl =
    `${new URL('.', self.location.href).pathname.slice(0, -1)}` +
    `/worker-app.js`;
const currentAppKey = appWorkerUrl.replace('.js', '-current.js');
const newAppKey = appWorkerUrl.replace('.js', '-new.js');

const openCache = () => {
    return caches.open('/smz/worker/root');
};

const getCacheKeys = async (cache: Cache) =>
    (await cache.keys()).map(key => new URL(key.url).pathname);

const getFilteredCacheKeys = async (cache: Cache, regex: RegExp) =>
    (await getCacheKeys(cache)).filter(key => regex.test(key));

const extractVersion = (key: string | undefined, regex: RegExp) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    key ? parseInt(key.match(regex)![1]) : Infinity;

let workerVersionList: string[];
let workerVersionIds: Map<string, string>;

const listWorkerVersions = async () => {
    // return cached list of worker versions, if present
    if (workerVersionList && workerVersionIds) {
        return {
            versions: workerVersionList,
            versionIds: workerVersionIds,
        };
    } // else, we'll need to build it

    // open our cache
    const cache = await openCache();

    // store our keys sorted by version in memory
    const regex = new RegExp(appWorkerUrl.replace('.js', '-([0-9]+).js'));
    workerVersionList = (await getFilteredCacheKeys(cache, regex)).sort(
        (a, b) => extractVersion(b, regex) - extractVersion(a, regex)
    );

    // store the response ids for each version in memory
    workerVersionIds = new Map();
    for (const key of workerVersionList) {
        const response = await cache.match(key);
        if (!response) {
            throw new Error(
                `Error building worker version list: no match ` +
                    `found for key: ${key}`
            );
        }
        const responseId = response.headers.get('X-Smz-Worker-App-Script-Id');
        if (!responseId) {
            workerVersionList.splice(workerVersionList.indexOf(key), 1);
            continue;
        }
        workerVersionIds.set(key, responseId);
    }

    // return our version list
    return {
        versions: workerVersionList,
        versionIds: workerVersionIds,
    };
};

const rollbackWorker = async () => {
    logger.info('Rolling back app worker...');
    // open our cache
    const cache = await openCache();
    // get our current script
    const currentResponse = await cache.match(currentAppKey);
    const currentId = currentResponse?.headers.get(
        'X-Smz-Worker-App-Script-Id'
    );
    // if there is no current script
    if (!currentId) {
        // there is nothing to rollback
        logger.warn('No current app worker found, skipping rollback.');
        return false;
    }
    // get our worker list
    const { versions, versionIds } = await listWorkerVersions();
    // get our current worker index in the list (descending order)
    const currentWorkerIndex = versions.findIndex(
        key => versionIds.get(key) === currentId
    );
    // rollback worker to previous version
    const rollbackKey = versions[currentWorkerIndex + 1];
    if (!rollbackKey) {
        logger.warn('Rollback reached end of version list.');
        return false;
    }
    const rollbackResponse = await cache.match(rollbackKey);
    if (!rollbackResponse) {
        throw new Error(
            `Error rolling back app worker: no match found for key: ${rollbackKey}`
        );
    }
    await cache.put(newAppKey, rollbackResponse.clone());
    return true;
};

const fetchWorkerUrl = async () => {
    const originalResponse = await fetch(new Request(appWorkerUrl));
    const headers = new Headers(originalResponse.headers);
    headers.set('X-Smz-Worker-App-Script-Id', self.crypto.randomUUID());
    return new Response(originalResponse.body, {
        headers,
        status: originalResponse.status,
        statusText: originalResponse.statusText,
    });
};

enum ScriptState {
    CURRENT,
    NEW,
}

const fetchWorkerScript = async () => {
    const cache = await openCache();

    // first check for a new script
    const newResponse = await cache.match(newAppKey);
    // if we found a new script
    if (newResponse) {
        logger.info('Found new app worker at: ', appWorkerUrl);
        // consume the new script
        await cache.delete(newAppKey);
        await cache.put(currentAppKey, newResponse.clone());
        // return the new script
        return {
            state: ScriptState.NEW,
            script: await newResponse.text(),
        };
    }

    // now, check for a current script
    const currentResponse = await cache.match(currentAppKey);
    // if we found a current script
    if (currentResponse) {
        logger.info('Found current app worker at: ', appWorkerUrl);
        // return the current script
        return {
            state: ScriptState.CURRENT,
            script: await currentResponse.text(),
        };
    }

    // we haven't found a script in our cache, so fetch it
    logger.info('Cache hit miss, fetching app worker at: ', appWorkerUrl);
    // Hit the network
    const response = await fetchWorkerUrl();
    // Add the network response to the cache for later visits
    await cache.put(currentAppKey, response.clone());
    // return the text
    logger.info('Fetched app worker at: ', appWorkerUrl);
    return {
        state: ScriptState.NEW,
        script: await response.text(),
    };
};

/*
 * In JavaScript, many events can't be re-dispatched, so I get to implement my
 * own event target -_-
 *
 */
class EventTargetImpl implements EventTarget {
    private listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
        new Map();

    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (options) {
            console.warn(
                'WorkerApp.addEventListener() options param not supported, ignoring: ',
                options
            );
        }
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)?.add(listener);
    }
    removeEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject,
        options?: EventListenerOptions | boolean
    ): void {
        if (options) {
            console.warn(
                'WorkerApp.removeEventListener() options param not supported, ignoring: ',
                options
            );
        }
        if (!this.listeners.has(type)) {
            return;
        }
        this.listeners.get(type)?.delete(callback);
    }
    dispatchEvent(event: Event): boolean {
        if (!this.listeners.has(event.type)) {
            return true;
        }
        for (const listener of this.listeners.get(event.type) ?? new Set()) {
            if (typeof listener === 'function') {
                listener(event);
            } else {
                listener.handleEvent(event);
            }
        }
        return true;
    }
}
// create an event target for delegating events from app to root worker
const eventDelegate = new EventTargetImpl();

// we override these methods so that our app worker can use them
const selfAddEventListener = self.addEventListener.bind(self);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selfRemoveEventListener = self.removeEventListener.bind(self);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selfSkipWaiting = self.skipWaiting.bind(self);

// our app worker will override these methods
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selfFetch = self.fetch.bind(self);

Object.assign(self, {
    addEventListener: (
        type: string,
        listener: EventListener,
        options: AddEventListenerOptions
    ) => eventDelegate.addEventListener(type, listener, options),
    removeEventListener: (
        type: string,
        listener: EventListener,
        options: EventListenerOptions
    ) => eventDelegate.removeEventListener(type, listener, options),
    skipWaiting: () => {
        // skipWaiting() will typically be called by the app in an asynchronous context,
        // and so will be invalid
        // make this a no-op
    },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WB_MANIFEST = self.__WB_MANIFEST;

const pendingDispatches: Event[] = [];

[
    // ServiceWorkerGlobalScope
    'activate',
    'contentdelete',
    'fetch',
    'install',
    'message',
    'messageerror',
    'notificationclick',
    'notificationclose',
    'periodicsync',
    'push',
    'pushsubscriptionchange',
    'sync',

    // WorkerGlobalScope
    'error',
].forEach(type => {
    selfAddEventListener(type, async event => {
        // create pending dispatch
        pendingDispatches.push(event);
        // wait for app to execute
        await appExecuted;
        // remove pending dispatch
        pendingDispatches.splice(pendingDispatches.indexOf(event), 1);
        // dispatch the event
        try {
            eventDelegate.dispatchEvent(event);
        } catch (e) {
            console.error(e);
        }
    });
});

const appExecuted = (async () => {
    let fetchedScript: Awaited<ReturnType<typeof fetchWorkerScript>>;
    while (true) {
        fetchedScript = await fetchWorkerScript();
        logger.info('Executing app worker script...');

        try {
            /*
             * Using the Function() constructor resulted in the line offsets for
             * source maps being off (due to the fact that the constructor adds a
             * minimum of two extra lines of code to the source).
             *
             * Without being able to find a way to offset this somehow (in webpack
             * or some other way), we'll instead use an indirect eval. This should
             * avoid a performance hit, and we weren't currently relying on the
             * function's isolated scope.
             */

            // eslint-disable-next-line no-eval
            eval?.(`${fetchedScript.script}
            //# sourceURL=/smz/pwa/worker-app.js`);
        } catch (e) {
            logger.error('Error executing app worker script: ', e);
            // attempt to rollback the worker, if NOT successful
            if (!(await rollbackWorker())) {
                throw new Error(
                    'Unable to rollback worker after failed app execution.'
                );
            }
            // our rollback was successful, now re-try
            continue;
        }

        logger.info('App worker script executed.');
        break;
    }

    // if this is a new script
    if (fetchedScript.state === ScriptState.NEW) {
        // we may need to dispatch some lifecycle events for it
        // if we've already installed and we do NOT have a pending install dispatch
        if (
            (self.registration.active ||
                self.registration.waiting ||
                self.registration.installing) &&
            !pendingDispatches.find(it => it.type === 'install')
        ) {
            // dispatch an install event
            logger.info(
                'Dispatching emulated install event on executed app worker.'
            );
            eventDelegate.dispatchEvent(new ExtendableEvent('install'));
        }
        // if we've already activated and we do NOT have a pending activate dispatch
        if (
            !self.registration.waiting &&
            !self.registration.installing &&
            self.registration.active &&
            !pendingDispatches.find(it => it.type === 'activate')
        ) {
            // dispatch an activate event
            logger.info(
                'Dispatching emulated activate event on executed app worker.'
            );
            eventDelegate.dispatchEvent(new ExtendableEvent('activate'));
        }
    }

    return fetchedScript;
})().catch(e => logger.error('Error executing app: ', e));

logger.info('Root worker executed.');
