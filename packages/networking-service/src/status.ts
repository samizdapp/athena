import { Debug } from './logging';
import fetchAgent from './fetch-agent';
import { environment } from './environment';

export enum Statuses {
    ONLINE = 'online',
    OFFLINE = 'offline',
    ERROR = 'error',
    IDLE = 'idle',
}

export class StatusUpdater {
    private readonly log = new Debug('status-manager');
    private readonly endpoint = 'http://localhost/smz/api/status/logs';

    constructor(private readonly service: string) {
        this.log.debug('init');
    }

    async sendStatus(status: Statuses, message = '') {
        if (environment.ignore_status) return;

        this.log.debug('send status', status);
        try {
            await fetchAgent.fetch(this.endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    service: this.service,
                    status,
                    message,
                }),
            });
        } catch (e) {
            this.log.error('send status error', e);
        }
    }
}
