/*
 * This service works around the following bug in libp2p:
 * https://github.com/libp2p/js-libp2p/issues/1530
 *
 * In order to prevent calling ping() concurrently,
 * we asynchronously queue concurrent calls to ping().
 *
 */

import { Multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';
import { PeerId } from '@libp2p/interface-peer-id';
import { AbortOptions } from '@libp2p/interfaces';
import { P2pClient } from '.';

import { logger } from '../logging';

export class PingService {
    private readonly log = logger.getLogger('worker/p2p/ping');

    private readonly queue: Array<() => Promise<void>> = [];

    private isRunning = false;

    constructor(private readonly client: P2pClient) {}

    private readonly run = async () => {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        while (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) {
                await next();
            }
        }
        this.isRunning = false;
    };

    private enqueue = <T>(fn: () => Promise<T>) => {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    resolve(await fn());
                } catch (e) {
                    reject(e);
                }
            });
            this.run();
        });
    };

    async ping(
        peer: Multiaddr | PeerId,
        options?: AbortOptions
    ): Promise<number> {
        return this.enqueue(async () => {
            if (!this.client.node) {
                throw new Error('Node not started!');
            }
            return this.client.node.ping(peer, options);
        });
    }
}
