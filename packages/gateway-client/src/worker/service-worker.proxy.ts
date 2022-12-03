// The workbox-precaching import includes a type definition for
// <self dot __WB_MANIFEST>.
// Import it even though we're not using any of the imports,
import type * as _ from 'workbox-precaching';

declare const self: {
    createProxy: () => typeof self;
} & ServiceWorkerGlobalScope;

const inheritedPropertiesOfSelf: string[] = [];
for (const k in self) {
    if (!Object.hasOwn(self, k)) {
        inheritedPropertiesOfSelf.push(k);
    }
}

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

const eventDelegate = new EventTargetImpl();

self.createProxy = () =>
    ({
        ...Object.fromEntries(
            [
                ...Object.getOwnPropertyNames(self),
                ...inheritedPropertiesOfSelf,
            ].map(key => [key, self[key as keyof typeof self]])
        ),
        createProxy: () => self.createProxy(),
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
    } as unknown as typeof self);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WB_MANIFEST = self.__WB_MANIFEST;

const appExecuted = (async () => {
    const response = await fetch('worker-app.js');
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    // eslint-disable-next-line no-new-func
    const appFn = new Function(`
        //# sourceURL=/smz/pwa/
        (parentSelf => {
            const self = parentSelf.createProxy();
            ${text}
        })(self);
    `);
    appFn();
})();

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
    self.addEventListener(type, async event => {
        await appExecuted;
        try {
            eventDelegate.dispatchEvent(event);
        } catch (e) {
            console.error(e);
        }
    });
});
