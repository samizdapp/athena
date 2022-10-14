import { register } from '@athena/shared/service-worker';
import { AppDispatch } from '../store';
import { setIsControlling, setStatus } from './serviceWorker.slice';

export class ServiceWorkerLogic {
    private updateStatus(dispatch: AppDispatch, worker: ServiceWorker) {
        dispatch(setStatus(worker.state));
        // check if controlling
        dispatch(
            setIsControlling(navigator.serviceWorker.controller === worker)
        );
    }

    async registerServiceWorker(dispatch: AppDispatch) {
        // first register our service worker
        const registration = await new Promise<ServiceWorkerRegistration>(
            resolve => {
                register({
                    onSuccess: resolve,
                });
            }
        );

        // now get our worker
        const worker =
            registration.installing ??
            registration.waiting ??
            registration.active;
        // if we couldn't
        if (!worker) {
            throw new Error(
                `Unable to retrieve service worker from registration.`
            );
        }

        // by now, we have our worker
        //update state
        this.updateStatus(dispatch, worker);

        // attach event listeners
        worker.addEventListener('statechange', () => {
            this.updateStatus(dispatch, worker);
        });
    }
}
