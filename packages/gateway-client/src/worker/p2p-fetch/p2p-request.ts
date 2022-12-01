import { Stream } from '@libp2p/interface-connection';
import { ServerPeerStatus } from '../../worker-messaging';
import { logger } from '../logging';
import { WrappedStream } from '../p2p-client/stream-factory';

import { P2pClient } from '../p2p-client';

const waitFor = async (t: number): Promise<void> =>
    new Promise(r => setTimeout(r, t));

class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

class ResponseTimeoutError extends Error {
    constructor(
        public readonly timeout: number,
        msg = `Timed out waiting for response (timeout: ${timeout})`
    ) {
        super(msg);
    }
}

class RequestAttempt {
    private log = logger.getLogger('worker/p2p-fetch/attempt');

    private deferredResponse?: Deferred<Buffer[]>;
    private stream?: WrappedStream;

    private hasReceivedChunk = false;
    private lastChunkTime = 0;
    private longestChunkTime = 0;
    private inProgress = false;

    constructor(
        private readonly requestId: string,
        private readonly p2pClient: P2pClient,
        private readonly parts: Buffer[],
        private responseTimeout: number
    ) {}

    private async pipe(stream: WrappedStream) {
        // track the time we received our last chunk
        this.lastChunkTime = Date.now();

        return stream.request(this.parts);

        // send our buffer through the stream
        // return pipe(this.parts, stream, async source => {
        //     // build a response buffer
        //     const responseParts: Buffer[] = [];
        //     // loop incoming chunks
        //     for await (const msg of source) {
        //         // calculate time since we received last chunk
        //         const timeSinceLastChunk = Date.now() - this.lastChunkTime;
        //         // if we haven't gotten a chunk yet
        //         if (!this.hasReceivedChunk) {
        //             // we have now
        //             this.log.debug(
        //                 `Request: ${this.requestId} - Timing: received first ` +
        //                     `chunk in ${timeSinceLastChunk}ms.`
        //             );
        //             this.hasReceivedChunk = true;
        //         }
        //         // else, we've already gotten chunks previously
        //         else {
        //             // update the longest time since last chunk
        //             this.longestChunkTime = Math.max(
        //                 this.longestChunkTime,
        //                 timeSinceLastChunk
        //             );
        //         }
        //         // track the time we received our last chunk
        //         this.lastChunkTime = Date.now();

        //         // store our chunk in our response buffer
        //         const buf = Buffer.from(msg.subarray());
        //         if (msg.subarray().length === 1 && buf[0] === 0x00) {
        //             // when we encounter the null byte at the end, we're done
        //             // receiving the response
        //             break;
        //         } else {
        //             responseParts.push(buf);
        //         }
        //     }
        //     // return our response buffer
        //     return responseParts;
        // });
    }

    private async send(): Promise<void> {
        // if we don't have a stream opened
        if (!this.stream) {
            // then we can't send a request through it
            throw new Error('No stream opened.');
        }

        try {
            // attempt to send our request through the stream and
            // receive a response
            const response = await this.pipe(this.stream);
            // once our response is received, resolve our promise with it
            this.deferredResponse?.resolve(response);
        } catch (e) {
            // handle any errors by rejecting our promise
            this.deferredResponse?.reject(e);
        }
    }

    private async loopStats(): Promise<void> {
        // if we're done
        if (!this.inProgress) {
            // stop looping
            return;
        }

        // calculate the time since we received our last chunk
        const timeSinceLastChunk = Date.now() - this.lastChunkTime;

        // if we haven't gotten any chunks and
        // we've surpassed our response timeout
        if (
            !this.hasReceivedChunk &&
            timeSinceLastChunk > this.responseTimeout
        ) {
            // then we need to cancel this attempt
            this.log.warn(
                `Request: ${this.requestId} - Timing: response timeout ` +
                    `(${this.responseTimeout}ms) reached, no chunks received ` +
                    `in ${timeSinceLastChunk}ms.`
            );
            this.deferredResponse?.reject(
                new ResponseTimeoutError(this.responseTimeout)
            );
        }

        // if we've gotten chunks, but it's been too long since our last chunk
        if (
            this.hasReceivedChunk &&
            timeSinceLastChunk > Math.max(500, this.longestChunkTime * 4)
        ) {
            // then we need to cancel this attempt
            this.log.warn(
                `Request: ${this.requestId} - Timing: no chunks received in ` +
                    `${timeSinceLastChunk}ms (longest time between chunks ` +
                    `is ${this.longestChunkTime}ms).`
            );
            this.deferredResponse?.reject(
                new Error('Too long without receiving a chunk.')
            );
        }

        // if our client is no longer connected
        if (this.p2pClient.connectionStatus !== ServerPeerStatus.CONNECTED) {
            // then we need to cancel this attempt
            this.log.warn(
                `Request: ${this.requestId} - P2P connection lost ` +
                    `(${this.p2pClient.connectionStatus}).`
            );
            this.deferredResponse?.reject(new Error('P2P connection lost.'));
        }

        // wait a bit
        await waitFor(100);

        // continue looping
        this.loopStats();
    }

    public async execute(): Promise<Buffer[]> {
        // create a deferred object to hold our response in
        this.deferredResponse = new Deferred<Buffer[]>();

        // open a new stream, track the time it takes to open
        const streamOpenTime = Date.now();
        this.stream = await this.p2pClient.getProxyStream();
        this.log.debug(
            `Request: ${this.requestId} - Timing: opened stream in ` +
                `${Date.now() - streamOpenTime}ms`
        );

        // we've now started
        this.inProgress = true;

        // send our request through the stream
        this.send();

        // start the stats loop
        this.loopStats();

        try {
            // wait for our promise to settle
            await this.deferredResponse.promise;
        } catch (e) {
            // if we get an error, we need to close our stream
            this.log.warn(e);
            this.stream?.close();
        } finally {
            // our promise has settled, which means we're done
            this.inProgress = false;

            // release stream now that we're done
            this.p2pClient.releaseProxyStream(this.stream);
        }

        // return our settled promise (may be resolved or rejected)
        return this.deferredResponse.promise;
    }
}

export class P2pRequest {
    private log = logger.getLogger('worker/p2p-fetch/p2p-request');

    private deferredResponse?: Deferred<Buffer[]>;

    constructor(
        private readonly requestId: string,
        private readonly p2pClient: P2pClient,
        private readonly parts: Buffer[]
    ) {}

    private async loopAttempts(
        responseTimeout = this.parts.length * 5000,
        counter = 1
    ): Promise<void> {
        this.log.debug(
            `Request: ${this.requestId} - Attempt number ${counter}`
        );

        // track the time it takes to complete our attempt
        const startTime = Date.now();
        // create a new attempt for our request
        let responseParts: Buffer[] = [];
        const requestAttempt = new RequestAttempt(
            this.requestId,
            this.p2pClient,
            this.parts,
            responseTimeout
        );
        try {
            // execute our attempt, wait for a response
            responseParts = await requestAttempt.execute();
            this.log.debug(
                `Request: ${this.requestId} - Timing: response received in ` +
                    `${Date.now() - startTime}ms`
            );
            // we received a response, use it to resolve our promise
            this.deferredResponse?.resolve(responseParts);
            // we're done looping
            return;
        } catch (e) {
            // if this was due to a response timeout
            if (e instanceof ResponseTimeoutError) {
                // then increase our response timeout before trying again
                responseTimeout += this.parts.length * 5000;
            }
            this.log.debug(
                `Request: ${this.requestId} - Timing: attempt failed in ` +
                    `${Date.now() - startTime}ms`
            );
        }

        // if we made it to here, our attempt failed, continue trying
        this.loopAttempts(responseTimeout, ++counter);
    }

    public async execute() {
        // create a new deferred object to hold our response
        this.deferredResponse = new Deferred<Buffer[]>();

        // start attempting the request
        this.loopAttempts();

        // return our promise (may resolve or reject)
        return this.deferredResponse.promise;
    }
}
