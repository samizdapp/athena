import { logger } from '../logging';

declare const self: ServiceWorkerGlobalScope;

const log = logger.getLogger('worker/fetch/handlers');

export type Handler = (
    request: Request,
    respondWith: FetchEvent['respondWith']
) => void;

class FetchHandlers {
    private handlers: Handler[] = [];

    entryHandler(event: FetchEvent) {
        log.trace('Received fetch: ', event);

        // define custom respondWith method that tracks if it has been
        // called or not (so we know when to stop)
        let responded = false;
        const respondWith = (
            response: Parameters<FetchEvent['respondWith']>[0]
        ) => {
            responded = true;
            event.respondWith(response);
        };
        // loop our handlers until respondWith is called
        for (const handler of this.handlers) {
            handler(event.request, respondWith);
            if (responded) {
                break;
            }
        }
    }

    use(handler: Handler) {
        this.handlers.push(handler);
        return this;
    }
}

export default new FetchHandlers();
