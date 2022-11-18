import localforage from 'localforage';

import { ClientMessageType } from '../worker-messaging';
import { SamizdAppDevTools } from './devtools';
import { logger } from './logging';
import messenger from './messenger';
import { runMigrations } from './migrations';
import { P2pClient } from './p2p-client';
import { overrideFetch } from './p2p-fetch/override-fetch';
import status from './status';

declare const self: ServiceWorkerGlobalScope;

export default async () => {
    // create our bootstrap logger
    const log = logger.getLogger('worker/bootstrap');

    // run migrations before anything else
    await runMigrations();

    // setup event handlers
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

    messenger.addListener(ClientMessageType.OPENED, () => {
        localforage.setItem('started', { started: true });
    });

    // init messenger
    messenger.init();

    // create and start p2p client
    const p2pClient = new P2pClient();
    p2pClient.start();

    // initialize fetch override
    overrideFetch(p2pClient);

    // create dev tools
    new SamizdAppDevTools(p2pClient);
};
