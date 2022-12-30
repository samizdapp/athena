import { WebSockets } from '@athena/shared/libp2p/@libp2p/websockets';
import { MultiaddrConnection } from '@libp2p/interface-connection';
import { Upgrader } from '@libp2p/interface-transport';

import { logger } from '../../logging';
import { BootstrapAddress } from './bootstrap-address';
import { BootstrapList } from './bootstrap-list';

const log = logger.getLogger('worker/p2p/bootstrap/stats');

export type StatsTransport = (
    list: BootstrapList,
    address: BootstrapAddress,
    signal: AbortSignal
) => Promise<number>;

export const websocketStats: StatsTransport = async (list, address, signal) => {
    // send websocket request, track time
    const start = Date.now();
    let socket;
    let latency = Infinity;
    try {
        socket = await new WebSockets().dial(
            address.isRelay
                ? address.multiaddr.decapsulate('p2p-circuit')
                : address.multiaddr,
            {
                signal,
                upgrader: {
                    upgradeOutbound: async (socket: MultiaddrConnection) =>
                        socket,
                } as unknown as Upgrader,
            }
        );
        latency = Date.now() - start;
    } catch (e) {
        log.debug(`Failed to connect to ${address}: `, e);
    }
    // close the socket
    try {
        if (socket) {
            await socket.close();
        }
    } catch (e) {
        log.warn(`Failed to close socket to ${address}: `, e);
    }
    return latency;
};

export const pingStats: StatsTransport = async (list, address, signal) => {
    // we need a libp2p node for this
    if (!list.client.node) {
        throw new Error('No client connection established!');
    }
    try {
        return await list.client.ping(address.multiaddr, {
            signal,
        });
    } catch (e) {
        log.debug(`Failed to ping ${address}: `, e);
    }
    return Infinity;
};
