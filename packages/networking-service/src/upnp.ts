import natMapping, { Mapping } from 'node-portmapping';
import { environment } from './environments/environment';
import { internalIpV4 } from '@athena/shared/libp2p';

class UPNPPortMapper {
    private port: number;
    private mapping?: Mapping;
    public publicPort?: number;
    public publicHost?: string;
    public internalPort?: number;
    constructor(port: number) {
        this.port = port;
    }

    async start() {
        try {
            this.mapping = await new Promise<Mapping>((resolve, reject) => {
                console.log('creating mapping', this.port);
                const mapping = natMapping.createMapping(
                    {
                        internalPort: this.port,
                        protocol: 'TCP',
                    },
                    info => {
                        console.log(info);
                        if (info.state === 'Success') {
                            this.publicPort = info.externalPort;
                            this.publicHost = info.externalHost;
                            this.internalPort = info.internalPort;
                            resolve(mapping);
                        } else {
                            reject(new Error('Failed to create mapping'));
                        }
                        return {};
                    }
                );
            });
            this.publicPort = this.port;
        } catch (e) {
            console.error(e);
        }
        console.log(
            'created mapping',
            this.port,
            this.publicPort,
            this.publicHost
        );
    }

    async stop() {
        this.mapping?.destroy();
    }
}

export class UPNPService {
    readonly libp2p = new UPNPPortMapper(environment.libp2p_listen_port);
    readonly yggdrasil = new UPNPPortMapper(environment.yggdrasil_listen_port);
    resolved: Promise<void[]>;

    constructor() {
        natMapping.init();
        this.resolved = Promise.all([
            this.libp2p.start(),
            this.yggdrasil.start(),
        ]);
    }

    async stop() {
        await this.libp2p.stop();
        await this.yggdrasil.stop();
    }

    get info() {
        return {
            libp2p: {
                publicPort: this.libp2p.publicPort,
                publicHost: this.libp2p.publicHost,
                internalPort: this.libp2p.internalPort,
            },
            yggdrasil: {
                publicPort: this.yggdrasil.publicPort,
                publicHost: this.yggdrasil.publicHost,
                internalPort: this.yggdrasil.internalPort,
            },
        };
    }
    async getLocalIP() {
        return internalIpV4();
    }
}

export default new UPNPService();
