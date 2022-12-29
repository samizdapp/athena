#!/usr/bin/env node

import { Noise } from '@athena/shared/libp2p/@chainsafe/libp2p-noise';
import { Mplex } from '@athena/shared/libp2p/@libp2p/mplex';
import { WebSockets } from '@athena/shared/libp2p/@libp2p/websockets';
import { createLibp2p, Libp2p } from '@athena/shared/libp2p/libp2p';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';

export const createNode = async () => {
    const node = await createLibp2p({
        transports: [new WebSockets()],
        connectionEncryption: [new Noise() as unknown as ConnectionEncrypter],
        streamMuxers: [new Mplex() as StreamMuxerFactory],
        connectionManager: {
            dialTimeout: 60000,
            autoDial: false,
        },
    });

    node.connectionManager.addEventListener('peer:connect', evt => {
        const connection = evt.detail;
        console.log(`Connected to ${connection.remotePeer.toString()}`);
        // console.log(connection);
    });

    node.connectionManager.addEventListener('peer:disconnect', evt => {
        const connection = evt.detail;
        console.log(`disconnected from ${connection.remotePeer.toString()}`);
        // console.log(connection);
    });

    node.addEventListener('peer:discovery', evt => {
        console.log('peer:discovery', evt);
    });

    return node;
};

export const withNode = async (
    fn: (node: Libp2p) => Promise<void>,
    existingNode?: Libp2p
) => {
    const node = existingNode ?? (await createNode());
    await node.start();
    console.log(`Node started with id ${node.peerId.toString()}`);
    await fn(node);
    await node.stop();
};
