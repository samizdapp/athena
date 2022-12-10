import { environment } from '../environments/environment'
import { readFileSync, readFile, writeFile } from 'fs'

const waitFor = (ms: number) => new Promise(resolve => setTimeout(() => resolve(null), ms))

export class YggdrasilConfig {
    private saveDebounce = 60000
    private saveTimeout?: NodeJS.Timeout
    private _locked = false

    constructor(
        private readonly json = JSON.parse(readFileSync(environment.yggdrasil_config, 'utf8'))
    ) {}

    save(force = false){
        if (force) return this._save()
        clearTimeout(this.saveTimeout)
        this.saveTimeout = setTimeout(() => {
            const json = JSON.stringify(this.json)
            const oldContent = JSON.stringify(JSON.parse(readFileSync(environment.yggdrasil_config, 'utf8').trim()))
            if (oldContent === json) return console.log('yggdrasil config unchanged, not saving')
            console.log('yggdrasil config changed, saving')
            console.log('old', oldContent)
            console.log('new', json)
            this._save()

        }, this.saveDebounce)
    }

    private _save(){
        writeFile(environment.yggdrasil_config, JSON.stringify(this.json, null, 4), (err) => {
            if (err) console.warn(err)
            else console.log('saved yggdrasil config', this.json)
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
        this.unlock()
    }

    private async read(){
        return new Promise((resolve, reject) => {
            readFile(environment.yggdrasil_config,'utf8', (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        })
    }
}

export default new YggdrasilConfig()