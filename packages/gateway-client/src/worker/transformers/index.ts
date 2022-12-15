import injectors from './transformers';

import proxyWebSocketTransformer from './proxy-websocket';
import pingServiceWorkerTransformer from './ping-service-worker';
import basePathTransformer from './base-path';
import { SamizdappFlagTransformer } from './samizdapp-flags';

export default injectors;

export {
    proxyWebSocketTransformer,
    pingServiceWorkerTransformer,
    basePathTransformer,
    SamizdappFlagTransformer,
};
