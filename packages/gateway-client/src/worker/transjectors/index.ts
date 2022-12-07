import injectors from './injectors';

import proxyWebSocketInjector from './proxy-websocket';
import pingServiceWorkerInjector from './ping-service-worker';
import basePathInjector from './base-path';

export default injectors;

export { proxyWebSocketInjector, pingServiceWorkerInjector, basePathInjector };
