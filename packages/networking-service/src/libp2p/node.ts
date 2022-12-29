import { Noise } from '@athena/shared/libp2p/@chainsafe/libp2p-noise';
import { Mplex } from '@athena/shared/libp2p/@libp2p/mplex';
import {
    createEd25519PeerId,
    createFromProtobuf,
    exportToProtobuf,
} from '@athena/shared/libp2p/@libp2p/peer-id-factory';
import { WebSockets } from '@athena/shared/libp2p/@libp2p/websockets';
import { multiaddr } from '@athena/shared/libp2p/@multiformats/multiaddr';
import { createLibp2p, Libp2p } from '@athena/shared/libp2p/libp2p';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import {
    StreamHandler,
    StreamHandlerOptions,
} from '@libp2p/interface-registrar';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import { readFile, writeFile } from 'node:fs/promises';

import { environment } from '../environment';
import { Debug } from '../logging';
import upnp from '../upnp';
import { Deferred } from './streams/raw';

class Libp2pNode {
    private log = new Debug('libp2p-node');
    private ready = new Deferred<void>();
    private node?: Libp2p;
    constructor() {
        this.init()
            .then(async () => {
                this.log.info('libp2p node ready: ');
                this.log.info(
                    'self peer string:',
                    await this.getSelfPeerString()
                );
                this.log.info(
                    'local multiaddr:',
                    await this.getLocalMultiaddr()
                );
                this.log.info(
                    'public multiaddr:',
                    await this.getPublicMultiaddr()
                );
            })
            .catch(e => {
                this.log.error('libp2p node failed', e);
            });
    }

    private async init() {
        this.log.debug('init');
        const peerId = await readFile(environment.libp2p_id_file)
            .then(createFromProtobuf)
            .catch(async e => {
                this.log.warn('failed to read peer id', e);
                const _id = await createEd25519PeerId();
                await writeFile(
                    environment.libp2p_id_file,
                    exportToProtobuf(_id)
                );
                return _id;
            });

        this.log;
        const node = await createLibp2p({
            peerId,
            addresses: {
                listen: [
                    `/ip4/0.0.0.0/tcp/${environment.libp2p_listen_port}/ws`,
                ],
            },
            transports: [new WebSockets()],
            connectionEncryption: [
                new Noise() as unknown as ConnectionEncrypter,
            ],
            streamMuxers: [new Mplex() as StreamMuxerFactory],
            relay: {
                enabled: true,
                hop: {
                    enabled: true,
                    timeout: 10e8,
                },
                advertise: {
                    enabled: true,
                },
            },
            connectionManager: {
                autoDial: false,
            },
        });

        await node.start();
        this.node = node;
        this.ready.resolve();
    }

    public async dialProtocol(ma: string, protocol: string) {
        this.log.debug('dialProtocol', ma, protocol);
        await this.ready.promise;
        const s = await this.node?.dialProtocol(multiaddr(ma), protocol);
        if (!s) return null;
        s.metadata = { peer: ma };
        this.log.debug('dialProtocol result', ma, protocol, !!s);
        return s;
    }

    public async getSelfPeerString() {
        await this.ready.promise;
        return this.node?.peerId.toString();
    }

    public async getPublicMultiaddr() {
        const peerString = await this.getSelfPeerString();
        const upnpInfo = await upnp.info();
        const publicPort = upnpInfo.libp2p.internalPort;
        const publicHost = upnpInfo.libp2p.publicHost;
        if (!(publicPort && publicHost)) return null;

        return `/ip4/${publicHost}/tcp/${publicPort}/ws/p2p/${peerString}`;
    }

    public async getLocalMultiaddr() {
        const localIP = await upnp.getLocalIP();
        const upnpInfo = await upnp.info();
        const privatePort = upnpInfo.libp2p.internalPort;
        const selfPeerString = await this.getSelfPeerString();
        return `/ip4/${localIP}/tcp/${privatePort}/ws/p2p/${selfPeerString}`;
    }

    public async handleProtocol(
        protocol: string,
        handler: StreamHandler,
        options?: StreamHandlerOptions
    ) {
        await this.ready.promise;
        return this.node?.handle(protocol, handler, options);
    }
}

export default new Libp2pNode();
