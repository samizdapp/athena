import injectors from './transformers';

import proxyWebSocketTransformer from './proxy-websocket';
import pingServiceWorkerTransformer from './ping-service-worker';
import basePathTransformer from './base-path';

export default injectors;

export {
    proxyWebSocketTransformer,
    pingServiceWorkerTransformer,
    basePathTransformer,
};
