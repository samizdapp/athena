import { RPCWorker } from './rpc';
import config from './config';
import { Debug } from '../logging';

class YggdrasilWatchdog {
    private readonly log = new Debug('yggdrasil-watchdog');
    private errorCount = 0;
    private readonly maxErrors = 10;

    constructor(private readonly worker = new RPCWorker()) {
        worker.on('watchdog', () => {
            this.log.debug('yggdrasil daemon error, count:', this.errorCount);
            this.errorCount++;
            if (this.errorCount >= this.maxErrors) {
                this.log.info(
                    'yggdrasil daemon error count exceeded, rebooting daemon'
                );
                this.errorCount = 0;
                // force a daemon reboot by saving config
                config.save(true);
            }
        });
    }
}

export default new YggdrasilWatchdog();
