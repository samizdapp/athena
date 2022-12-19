import { Debug } from './logging';
import fetchAgent from './fetch-agent';
import { environment } from './environment';

export enum Status {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    ERROR = 'OFFLINE',
    IDLE = 'WAITING',
}

export class StatusUpdater {
    private readonly log = new Debug('status-manager');
    private readonly endpoint = `${environment.statusApiRoot}/logs`;

    constructor(private readonly service: string) {
        this.log.debug('init');
    }

    async sendStatus(status: Status, message: string) {
        if (environment.ignore_status) return;

        this.log.debug('send status', status);
        try {
            const response = await fetchAgent.fetch(this.endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    service: this.service,
                    status,
                    message,
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw await response.json();
            }
        } catch (e) {
            this.log.error('send status error', e);
        }
    }
}
