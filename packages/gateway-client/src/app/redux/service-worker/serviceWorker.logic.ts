import { register } from '@athena/shared/service-worker';

import {
    ClientMessageType,
    Message,
    ServerPeerStatus,
    WorkerMessageType,
} from '../../../worker-messaging';
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
        WorkerMessageType,
        (msg: Message<WorkerMessageType>, dispatch: AppDispatch) => void
    > = {
        SERVER_PEER_STATUS: (msg, dispatch) => {
            dispatch(setServerPeerStatus(msg.status as ServerPeerStatus));
        },
        LOADED_RELAYS: (msg, dispatch) => {
            dispatch(setRelayAddresses(msg.relays as string[]));
        },
        SW_MONITOR: (_msg, _dispatch) => {
            //noop
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

    private handleMessage(
        e: MessageEvent<Message<WorkerMessageType>>,
        dispatch: AppDispatch
    ) {
        const msg = e.data;
        if (!WorkerMessageType[msg.type]) {
            console.warn(
                'Ignoring service worker message with unknown type: ' + msg.type
            );
            return;
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
                    onUpdate: resolve,
                    onExisting: resolve,
                });
            }
        );

        // now get our worker
        // first, check for a worker that is controlling our page
        // (even if we just registered a new one, we need to talk to the worker
        // actually controlling us)
        this.worker = navigator.serviceWorker.controller;
        // if we don't have a worker yet
        if (!this.worker) {
            // check for a worker that we just registered
            this.worker =
                registration.installing ??
                registration.waiting ??
                registration.active;
        }
        // if we still don't have a worker
        if (!this.worker) {
            // then give up
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

        // request a status update (this may be an existing worker that won't
        // otherwise send us its status)
        this.worker.postMessage({
            type: ClientMessageType.REQUEST_STATUS,
        });
    }
}
