import {
    Mplex,
    WebSockets,
    Noise,
    createLibp2p,
    createFromProtobuf,
    createEd25519PeerId,
    exportToProtobuf,
    Libp2p,
    multiaddr,
} from '@athena/shared/libp2p';
import { readFile, writeFile } from 'fs/promises';
import { environment } from '../environments/environment';
import { ConnectionEncrypter } from '@libp2p/interface-connection-encrypter';
import { StreamMuxerFactory } from '@libp2p/interface-stream-muxer';
import {
    StreamHandler,
    StreamHandlerOptions,
} from '@libp2p/interface-registrar';
import { Deferred } from './streams/raw';
import upnp from '../upnp';
import { Debug } from '../logging';

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
            .catch(async _ => {
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
