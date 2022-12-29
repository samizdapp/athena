import { multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';
import { Stream } from '@libp2p/interface-connection';

import { Command } from '../command';
import { withNode } from '../libp2p';

export type DialBoxArgs = {
    multiaddr: string;
    protocol?: string;
};

export const dialBox: Command<DialBoxArgs> = async (argv, signal) =>
    withNode(async node => {
        let stream: Stream;
        try {
            stream = await node.dialProtocol(
                multiaddr(argv.multiaddr),
                argv.protocol ?? '/samizdapp-heartbeat',
                { signal }
            );
        } catch (e) {
            console.log('Error dialing protocol: ', e);
            return;
        }

        console.log(`Connected to the node via `, stream);

        signal.addEventListener('abort', () => {
            console.log('Aborting connection');
            stream?.close();
        });

        for await (const msg of stream.source) {
            console.log(
                'received message: ',
                Buffer.from(msg.subarray()).toString('hex')
            );
        }

        console.log('Connection closed');
    });
