import natMapping, {Mapping} from 'node-portmapping'
import {environment} from './environments/environment'
natMapping.init();

class UPNPPortMapper {
    private port: number
    private mapping?: Mapping
    public publicPort?: number
    public publicHost?: string
    constructor(port: number) {
        this.port = port
    }

    async start() {
        try {
            this.mapping = await new Promise<Mapping>((resolve, reject) => {
                console.log('creating mapping', this.port)
                const mapping = natMapping.createMapping({
                    internalPort: this.port,
                    protocol: 'TCP',
                }, (info) => {
                    console.log(info)
                    if (info.state === 'Success') {
                        this.publicPort = info.externalPort
                        this.publicHost = info.externalHost
                        resolve(mapping)
                    } else {
                        reject(new Error('Failed to create mapping'))
                    }
                    return {}
                })
            })
            this.publicPort = this.port
        } catch (e) {
            console.error(e)
        }

    }

    async stop() {
        this.mapping?.destroy()
    }


}

export class UPNPService {
    readonly libp2p = new UPNPPortMapper(environment.libp2p_listen_port)
    readonly yggdrasil = new UPNPPortMapper(environment.yggdrasil_listen_port)

    async start() {
        await this.libp2p.start()
        await this.yggdrasil.start()
    }

    async stop() {
        await this.libp2p.stop()
        await this.yggdrasil.stop()
    }
}

export default new UPNPService()