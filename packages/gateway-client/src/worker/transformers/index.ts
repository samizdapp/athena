import transformers from './transformers';

import proxyWebSocketTransformer from './proxy-websocket';
import pingServiceWorkerTransformer from './ping-service-worker';
import basePathTransformer from './base-path';
import { SamizdappFlagTransformer } from './samizdapp-flags';
import localTransformer from './local';

export default transformers;

export {
    proxyWebSocketTransformer,
    pingServiceWorkerTransformer,
    basePathTransformer,
    SamizdappFlagTransformer,
    localTransformer,
};
