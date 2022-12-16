import transformers from './transformers';

import proxyWebSocketTransformer from './proxy-websocket';
import pingServiceWorkerTransformer from './ping-service-worker';
import basePathTransformer from './base-path';
import { SamizdappFlagTransformer } from './samizdapp-flags';

transformers
    .use(proxyWebSocketTransformer)
    .use(pingServiceWorkerTransformer)
    .use(new SamizdappFlagTransformer('/manifest.json', 'pleroma', true))
    .use(new SamizdappFlagTransformer('/smz', 'samizdapp'));

export default transformers;

export {
    proxyWebSocketTransformer,
    pingServiceWorkerTransformer,
    basePathTransformer,
    SamizdappFlagTransformer,
};
