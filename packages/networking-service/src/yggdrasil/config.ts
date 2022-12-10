import { environment } from '../environments/environment'
import { readFileSync, writeFile } from 'fs'

const waitFor = (ms: number) => new Promise(resolve => setTimeout(() => resolve(null), ms))

export class YggdrasilConfig {
    private _locked = false

    constructor(
        private readonly json = JSON.parse(readFileSync(environment.yggdrasil_config, 'utf8'))
    ) {}

    private save(){
        console.log('saving yggdrasil config', this.json)
        return new Promise<void>((resolve, reject) => {
            writeFile(environment.yggdrasil_config, JSON.stringify(this.json, null, 4), (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    get AllowedPublicKeys(): Set<string> {
        return new Set(this.json.AllowedPublicKeys)
    }

    private async lock(){
        while(this._locked){
            await waitFor(100)
        }
        this._locked = true
    }

    private unlock(){
        this._locked = false
    }

    async allowPublicKey(key: string) {
        await this.lock()
        const existing = new Set(this.json.AllowedPublicKeys)
        if (existing.has(key)) return this.unlock();
        existing.add(key)
        this.json.AllowedPublicKeys = Array.from(existing)
        await this.save()
        this.unlock()
    }

    get Peers(): Set<string> {
        return new Set(this.json.Peers)
    }

    async addPeer(addr: string) {
        await this.lock()
        addr = addr.trim()
        const existing = new Set(this.json.Peers)
        if (existing.has(addr)) return this.unlock()
        
        existing.add(addr)
        this.json.Peers = Array.from(existing)
        await this.save()
        this.unlock()
    }
}

export default new YggdrasilConfig()