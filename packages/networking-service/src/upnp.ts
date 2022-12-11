import natMapping, { Mapping } from 'node-portmapping';
import { environment } from './environments/environment';
import localip from 'local-ip';

class UPNPPortMapper {
    private port: number;
    private mapping?: Mapping;
    public publicPort?: number;
    public publicHost?: string;
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
            },
            yggdrasil: {
                publicPort: this.yggdrasil.publicPort,
                publicHost: this.yggdrasil.publicHost,
            },
        };
    }
    async getLocalIPS() {
        const res = await Promise.all(
            ['eth0', 'wlan0', 'en0'].map(
                iface =>
                    new Promise(resolve =>
                        localip(iface, (err: Error, ip: string) =>
                            resolve(err ? null : ip)
                        )
                    )
            )
        );
        return res.filter(i => i);
    }
}

export default new UPNPService();
