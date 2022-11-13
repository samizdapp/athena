import {
    ClientMessageType,
    Message,
    WorkerMessageType,
} from '../worker-messaging';
import { getBootstrapClient } from './client';
import { logger } from './logging';

declare const self: ServiceWorkerGlobalScope;

type MessageHandler = (msg: Message<ClientMessageType>) => void;

class Messenger {
    private eventTarget = new EventTarget();
    private listeners: Map<MessageHandler, EventListener> = new Map();
    private log = logger.getLogger('worker/messenger');

    init() {
        self.addEventListener('message', event => {
            const msg = event.data;
            this.log.debug('Received client message: ', msg);
            this.eventTarget.dispatchEvent(
                new CustomEvent(msg.type, { detail: msg })
            );
        });
    }

    addListener<K extends ClientMessageType>(type: K, handler: MessageHandler) {
        const listener = ((event: CustomEvent<Message<ClientMessageType>>) => {
            const msg = event.detail as Message<ClientMessageType>;
            handler(msg);
        }) as EventListener;

        this.listeners.set(handler, listener);

        this.eventTarget.addEventListener(type, listener);
    }

    removeListener<K extends ClientMessageType>(
        type: K,
        handler: MessageHandler
    ) {
        const listener = this.listeners.get(handler);
        if (listener) {
            this.eventTarget.removeEventListener(type, listener);
            this.listeners.delete(handler);
        }
    }

    async postMessage(msg: Message<WorkerMessageType>) {
        const client = await getBootstrapClient();
        this.log.debug('Sending worker message: ', msg);
        client?.postMessage(msg);
    }
}

export default new Messenger();
