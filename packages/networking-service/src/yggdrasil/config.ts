import { environment } from '../environments/environment';
import { readFileSync, writeFile } from 'fs';
import { Debug } from '../logging';

const waitFor = (ms: number) =>
    new Promise(resolve => setTimeout(() => resolve(null), ms));

export class YggdrasilConfig {
    private readonly log = new Debug('yggdrasil-config');

    private saveDebounce = 60000;
    private saveTimeout?: NodeJS.Timeout;
    private _locked = false;

    constructor(
        private readonly json = JSON.parse(
            readFileSync(environment.yggdrasil_config, 'utf8')
        )
    ) {}

    save(force = false) {
        this.log.debug('save called, force:', force);
        if (force) return this._save();
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            const json = JSON.stringify(this.json);
            const oldContent = JSON.stringify(
                JSON.parse(
                    readFileSync(environment.yggdrasil_config, 'utf8').trim()
                )
            );
            if (oldContent === json) {
                this.log.info('yggdrasil config unchanged, not saving');
                return;
            }
            this.log.info(
                'yggdrasil config changed, saving (set debug level to see changes)'
            );
            this.log.debug('old', oldContent);
            this.log.debug('new', json);
            this._save();
        }, this.saveDebounce);
    }

    private _save() {
        writeFile(
            environment.yggdrasil_config,
            JSON.stringify(this.json, null, 4),
            err => {
                if (err) console.warn(err);
                else this.log.debug('saved yggdrasil config');
            }
        );
    }

    get AllowedPublicKeys(): Set<string> {
        return new Set(this.json.AllowedPublicKeys);
    }

    private async lock() {
        while (this._locked) {
            await waitFor(100);
        }
        this._locked = true;
    }

    private unlock() {
        this._locked = false;
    }

    async allowPublicKey(key: string) {
        this.log.debug('allowing public key', key);
        await this.lock();
        const existing = new Set(this.json.AllowedPublicKeys);
        if (existing.has(key)) return this.unlock();
        existing.add(key);
        this.json.AllowedPublicKeys = Array.from(existing);
        this.unlock();
        this.log.debug('allowed public key', key);
    }

    get Peers(): Set<string> {
        return new Set(this.json.Peers);
    }

    async addPeer(addr: string) {
        this.log.debug('adding peer', addr);
        await this.lock();
        addr = addr.trim();
        const existing = new Set(this.json.Peers);
        if (existing.has(addr)) return this.unlock();

        existing.add(addr);
        this.json.Peers = Array.from(existing);
        this.unlock();
        this.log.debug('added peer', addr);
    }
}

export default new YggdrasilConfig();
