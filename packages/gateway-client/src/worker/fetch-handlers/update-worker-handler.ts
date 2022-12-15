import { updateAppWorker } from '../update-app';
import { Handler } from './fetch-handlers';

export const updateWorkerHandler: Handler = request => {
    // only update our worker on page navigation
    if (request.mode !== 'navigate') {
        return;
    }

    // use a timeout so that hopefully this request will appear in the
    // devtools (i.e. wait until the page loads enough for devtools to
    // start logging requests)
    setTimeout(() => {
        updateAppWorker();
    }, 1000);
};

export default updateWorkerHandler;
