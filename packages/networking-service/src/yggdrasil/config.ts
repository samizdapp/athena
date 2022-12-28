import { readFileSync, writeFile } from 'node:fs';

import { environment } from '../environment';
import { Debug } from '../logging';
import upnp from '../upnp';

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
        if (force) {
            this._save(force);
            return;
        }
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(this._save.bind(this), this.saveDebounce);
    }

    private async _save(force = false) {
        await this.sanitizeConfig();
        const json = JSON.stringify(this.json);
        const oldContent = JSON.stringify(
            JSON.parse(
                readFileSync(environment.yggdrasil_config, 'utf8').trim()
            )
        );
        if (!force && oldContent === json) {
            this.log.info('yggdrasil config unchanged, not saving');
            return;
        }
        this.log.info(
            'yggdrasil config changed, saving (set debug level to see changes)'
        );
        this.log.debug('old', oldContent);
        this.log.debug('new', json);

        writeFile(
            environment.yggdrasil_config,
            JSON.stringify(this.json, null, 4),
            err => {
                if (err) console.warn(err);
                else this.log.debug('saved yggdrasil config');
            }
        );
    }

    private async sanitizeConfig() {
        const selfPeer = await this.getSelfPeerString();
        this.json.AdminListen = `tcp://${environment.yggdrasil_admin_host}:${environment.yggdrasil_admin_port}`;
        this.json.Peers = this.json.Peers.filter(
            (peer: string) => peer !== selfPeer
        );
    }

    private async getSelfPeerString() {
        const upnpInfo = await upnp.info();
        if (!(upnpInfo.yggdrasil.publicHost && upnpInfo.yggdrasil.publicPort))
            return null;
        return `tcp://[${upnpInfo.yggdrasil.publicHost}]:${upnpInfo.yggdrasil.publicPort}`;
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
