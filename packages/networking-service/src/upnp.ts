import { Mapping } from 'node-portmapping';
import { environment } from './environments/environment';
import { internalIpV4 } from '@athena/shared/libp2p';
import { Debug } from './logging';

let natMapping: typeof import('node-portmapping') | null = null;
const log = new Debug('upnp');

class UPNPPortMapper {
    private log = log;

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
            this.log.debug('creating mapping', this.port);
            this.mapping = await new Promise<Mapping | undefined>(
                (resolve, reject) => {
                    const mapping = natMapping?.createMapping(
                        {
                            internalPort: this.port,
                            protocol: 'TCP',
                        },
                        info => {
                            this.log.trace('mapping created internal', info);
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
                }
            );
            this.publicPort = this.port;
        } catch (e) {
            this.log.error((e as Error).message || (e as string));
        }
        this.log.debug(
            'created mapping',
            this.port,
            this.publicPort,
            this.publicHost
        );
    }

    async stop() {
        this.log.debug('destroying mapping', this.port);
        this.mapping?.destroy();
    }
}

export class UPNPService {
    private readonly log = log;
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    private error: boolean = false;
    readonly libp2p = new UPNPPortMapper(environment.libp2p_listen_port);
    readonly yggdrasil = new UPNPPortMapper(environment.yggdrasil_listen_port);
    ready: Promise<void[]> | undefined;

    constructor() {
        import('node-portmapping')
            .then(_natMapping => {
                natMapping = _natMapping;
                natMapping.init();

                this.log.info('UPNP service started');
                this.ready = Promise.all([
                    this.libp2p.start(),
                    this.yggdrasil.start(),
                ]);
                this.info().then(res => {
                    this.log.info('UPNP service ready', res);
                });
            })
            .catch(e => {
                this.error = true;
                this.log.error((e as Error).message || (e as string));
            });
    }

    async stop() {
        this.log.info('UPNP service stopping');
        if (!this.error) {
            await this.ready;
            await this.libp2p.stop();
            await this.yggdrasil.stop();
        }
        this.log.info('UPNP service stopped');
    }

    async info() {
        this.log.trace('UPNP service info called');
        if (this.error) {
            return {
                libp2p: {
                    internalPort: environment.libp2p_listen_port,
                },
                yggdrasil: {
                    internalPort: environment.yggdrasil_listen_port,
                },
            };
        }
        await this.ready;
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
