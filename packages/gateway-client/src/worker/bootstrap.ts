import { logger } from './logging';
import messenger from './messenger';
import p2pClient from './p2p-client';
import { overrideFetch } from './p2p-fetch/override-fetch';
import status from './status';

declare const self: ServiceWorkerGlobalScope;

export default async () => {
    const log = logger.getLogger('worker/bootstrap');

    self.addEventListener('online', () => log.debug('<<<<online'));
    self.addEventListener('offline', () => log.debug('<<<<offline'));

    self.addEventListener('install', _event => {
        log.info('Installing...');

        // The promise that skipWaiting() returns can be safely ignored.
        self.skipWaiting();

        // Perform any other actions required for your
        // service worker to install, potentially inside
        // of event.waitUntil();
        log.debug('Skipped waiting');
    });

    self.addEventListener('activate', async _event => {
        log.info('Activating...');

        await self.clients.claim();

        // send status update to our client
        status.sendCurrent();

        log.debug('Finish clients claim');
    });

    messenger.init();

    const clientConnected = p2pClient();

    overrideFetch(clientConnected);
};
