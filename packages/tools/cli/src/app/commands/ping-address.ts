import { multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';

import { Command } from '../command';
import { withNode } from '../libp2p';

export type PingAddressArgs = {
    multiaddr: string;
};

export const pingAddress: Command<PingAddressArgs> = async (argv, signal) =>
    withNode(async node => {
        let conn;
        try {
            conn = await node.ping(multiaddr(argv.multiaddr), { signal });
        } catch (e) {
            console.log('Error pinging address: ', e);
            return;
        }

        console.log('Successfully pinged address: ' + argv.multiaddr);
        console.log('Latency: ' + conn + 'ms');
    });
