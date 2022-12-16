import transformers from './transformers';

import proxyWebSocketTransformer from './proxy-websocket';
import pingServiceWorkerTransformer from './ping-service-worker';
import basePathTransformer from './base-path';
import { SamizdappFlagTransformer } from './samizdapp-flags';

transformers
    .use(proxyWebSocketTransformer)
    .use(pingServiceWorkerTransformer)
    .use(basePathTransformer)
    .use(new SamizdappFlagTransformer('/smz', 'samizdapp'))
    .use(new SamizdappFlagTransformer('/manifest.json', 'pleroma', true));

export default transformers;

export {
    proxyWebSocketTransformer,
    pingServiceWorkerTransformer,
    basePathTransformer,
    SamizdappFlagTransformer,
};
