// The workbox-precaching import includes a type definition for
// <self dot __WB_MANIFEST>.
// Import it even though we're not using any of the imports,
import type * as _ from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

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

class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T | Promise<T>) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

const appWorkerUrl = 'worker-app.js';
const appExecuted = new Deferred<string>();

const openCache = () => {
    return caches.open('/smz/worker/root');
};

const fetchWorkerUrl = () => {
    return fetch(new Request(appWorkerUrl));
};

const fetchWorkerScript = async () => {
    const cache = await openCache();
    // Go to the cache first
    let response = await cache.match(appWorkerUrl);
    // if we didn't find a cached response
    if (!response) {
        logger.info('Cache hit miss, fetching app worker at: ', appWorkerUrl);
        // Hit the network
        response = await fetchWorkerUrl();
        // Add the network response to the cache for later visits
        cache.put(appWorkerUrl, response.clone());
    }
    // by now, we should have a response
    logger.info('Fetched app worker at: ', appWorkerUrl);
    // return the text
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return text;
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

appExecuted.resolve(
    (async () => {
        const script = await fetchWorkerScript();
        logger.info('Executing app worker script...');
        // eslint-disable-next-line no-new-func
        const appFn = new Function(`
            //# sourceURL=/smz/pwa/
            ${script}
        `);
        appFn();
        logger.info('App worker script executed.');
        return script;
    })()
);

logger.info('Root worker executed.');
