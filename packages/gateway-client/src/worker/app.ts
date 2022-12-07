// The workbox-precaching import includes a type definition for
// <self dot __WB_MANIFEST>.
// Import it even though we're not using any of the imports,
import * as workboxPrecaching from 'workbox-precaching';

import bootstrap from './bootstrap';
import {
    passThroughHandler,
    pleromaTimelineHandler,
    staticCacheHandler,
} from './fetch-handlers';
import fetchHandlers from './fetch-handlers/fetch-handlers';
import updateWorkerHandler from './fetch-handlers/update-worker-handler';
import injectors, {
    proxyWebSocketInjector,
    pingServiceWorkerInjector,
} from './injectors';
import { logger } from './logging';

// Mark the workbox-precaching import as being used with this line:
const _ = workboxPrecaching;

declare const self: ServiceWorkerGlobalScope;

const log = logger.getLogger('worker/main');

log.info('Executing worker...');

// To disable all workbox logging during development, you can set self.__WB_DISABLE_DEV_LOGS to true
// https://developers.google.com/web/tools/workbox/guides/configure-workbox#disable_logging
// self.__WB_DISABLE_DEV_LOGS = true

const WB_MANIFEST = self.__WB_MANIFEST;

// Precache all of the assets generated by your build process.
// Their URLs are injected into the manifest variable below.
// This variable must be present somewhere in your service worker file,
// even if you decide not to use precaching. See https://cra.link/PWA
//precacheAndRoute(WB_MANIFEST);

log.trace(WB_MANIFEST);

fetchHandlers
    .use(updateWorkerHandler)
    .use(staticCacheHandler)
    .use(pleromaTimelineHandler)
    .use(passThroughHandler);

injectors.use(proxyWebSocketInjector).use(pingServiceWorkerInjector);

bootstrap();

log.info('Worker executed.');