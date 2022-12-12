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
class Libp2pNode {
    private ready = new Deferred<void>();
    private node?: Libp2p;
    constructor() {
        this.init();
    }

    private async init() {
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
                autoDial: false, // Auto connect to discovered peers (limited by ConnectionManager minConnections)
            },
        });

        await node.start();
        this.node = node;
        this.ready.resolve();
    }

    public async dialProtocol(ma: string, protocol: string) {
        await this.ready.promise;
        return this.node?.dialProtocol(multiaddr(ma), protocol);
    }

    public async getSelfPeerString() {
        await this.ready.promise;
        return this.node?.peerId.toString();
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
