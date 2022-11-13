import { Handler } from './fetch-handlers';

export const passThroughHandler: Handler = (request, respondWith) => {
    respondWith(fetch(request));
};

export default passThroughHandler;
