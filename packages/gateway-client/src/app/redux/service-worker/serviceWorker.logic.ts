import { register } from '@athena/shared/service-worker';
import {
    Message,
    MessageType,
    ServerPeerStatus,
} from '../../../service-worker';
import { AppDispatch } from '../store';
import {
    setIsControlling,
    setRelayAddresses,
    setServerPeerStatus,
    setStatus,
} from './serviceWorker.slice';

export class ServiceWorkerLogic {
    private handlers: Record<string, EventListener> = {};

    private worker: ServiceWorker | null = null;

    private messageHandlers: Record<
        MessageType,
        (msg: Message, dispatch: AppDispatch) => void
    > = {
        SERVER_PEER_STATUS: (msg: Message, dispatch: AppDispatch) => {
            dispatch(setServerPeerStatus(msg.status as ServerPeerStatus));
        },
        LOADED_RELAYS: (msg: Message, dispatch: AppDispatch) => {
            dispatch(setRelayAddresses(msg.relays as string[]));
        },
    };

    private updateStatus(dispatch: AppDispatch) {
        if (!this.worker) {
            throw new Error('Missing worker in updateStatus()');
        }
        dispatch(setStatus(this.worker.state));
        // check if controlling
        dispatch(
            setIsControlling(navigator.serviceWorker.controller === this.worker)
        );
    }

    private handleMessage(e: MessageEvent<Message>, dispatch: AppDispatch) {
        const msg = e.data;
        if (!MessageType[msg.type]) {
            console.warn(
                'Ignoring service worker message with unknown type: ' + msg.type
            );
        }
        this.messageHandlers[msg.type](msg, dispatch);
    }

    private updateEventListener(event: string, handler: EventListener) {
        if (this.handlers[event]) {
            navigator.serviceWorker.removeEventListener(event, handler);
        }
        this.handlers[event] = handler;
        navigator.serviceWorker.addEventListener(event, handler);
    }

    private registerContainerListeners(dispatch: AppDispatch) {
        // remove old event listeners and add new ones
        this.updateEventListener('message', e =>
            this.handleMessage(e as MessageEvent, dispatch)
        );
    }

    async registerServiceWorker(dispatch: AppDispatch) {
        // remove previous worker state
        this.worker = null;

        // register listeners on our container first
        this.registerContainerListeners(dispatch);

        // next, register our service worker
        const registration = await new Promise<ServiceWorkerRegistration>(
            resolve => {
                register({
                    onSuccess: resolve,
                });
            }
        );

        // now get our worker
        this.worker =
            registration.installing ??
            registration.waiting ??
            registration.active;
        // if we couldn't
        if (!this.worker) {
            throw new Error(
                `Unable to retrieve service worker from registration.`
            );
        }

        // by now, we have our worker
        //update state
        this.updateStatus(dispatch);

        // attach event listeners
        this.worker.addEventListener('statechange', () => {
            this.updateStatus(dispatch);
        });
    }
}
