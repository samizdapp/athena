import { isBootstrapAppUrl } from '../client';
import { logger } from '../logging';
import { P2pClient } from '../p2p-client';
import { P2pFetchRequest } from './p2p-fetch-request';

const log = logger.getLogger('worker/p2p-fetch/override');

const p2pFetch = async (
    p2pClient: P2pClient,
    givenReqObj: URL | RequestInfo,
    givenReqInit: RequestInit | undefined = {}
): Promise<Response> => {
    const request = new P2pFetchRequest(p2pClient, givenReqObj, givenReqInit);

    // apply filtering to the request
    const url = new URL(request.reqObj.url);
    if (process.env.NX_LOCAL === 'true' && isBootstrapAppUrl(url)) {
        return nativeFetch(givenReqObj, givenReqInit);
    }

    return request.execute();
};

export const nativeFetch = self.fetch;

export const overrideFetch = (client: P2pClient) => {
    const p2pClient = client;

    // track client connection
    type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
    let connectionStatus: ConnectionStatus = 'connecting';
    p2pClient.addEventListener('connected', () => {
        connectionStatus = 'connected';
        log.info('Client connected');
    });
    p2pClient.addEventListener('connectionerror', e => {
        connectionStatus = 'disconnected';
        log.error('Client connection error: ', e.detail);
    });
    p2pClient.addEventListener('disconnected', () => {
        connectionStatus = 'connecting';
        log.info('Client disconnected');
    });

    // override fetch
    self.fetch = async (...args) => {
        // if we are connected, use p2p fetch
        if (connectionStatus === 'connected') {
            log.trace('Using p2p fetch: ', args[0]);
            return p2pFetch(p2pClient, ...args);
        }

        // else, if we are disconnected, use native fetch
        if (connectionStatus === 'disconnected') {
            log.trace('Using native fetch: ', args[0]);
            return nativeFetch(...args);
        }

        // else, we are still connecting, wait for connection
        log.info('Waiting for client connection, fetch deferred...', args[0]);
        return new Promise(resolve => {
            const handler = () => {
                p2pClient.removeEventListener('connected', handler);
                // try again
                log.info('Retrying deferred fetch...', args[0]);
                resolve(self.fetch(...args));
            };
            p2pClient.addEventListener('connected', handler);
        });
    };
};
