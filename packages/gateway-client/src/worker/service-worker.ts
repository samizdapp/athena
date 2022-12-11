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

const appWorkerUrl = 'worker-app.js';
const currentAppKey = appWorkerUrl.replace('.js', '-current.js');
const newAppKey = appWorkerUrl.replace('.js', '-new.js');

const openCache = () => {
    return caches.open('/smz/worker/root');
};

const fetchWorkerUrl = () => {
    return fetch(new Request(appWorkerUrl));
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
        await appExecuted;
        try {
            eventDelegate.dispatchEvent(event);
        } catch (e) {
            console.error(e);
        }
    });
});

const appExecuted = (async () => {
    const fetchedScript = await fetchWorkerScript();
    logger.info('Executing app worker script...');

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

    logger.info('App worker script executed.');
    return script;
})();

logger.info('Root worker executed.');
