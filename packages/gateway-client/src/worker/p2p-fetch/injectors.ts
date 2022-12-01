import { ClientMessageType, WorkerMessageType } from '../../worker-messaging';
import messenger from '../messenger';

declare type Injector = (headers: Headers, body: Buffer) => Buffer;

class Injectors {
    constructor(private readonly injectors: Injector[]) {}

    inject(headers: Headers, body: Buffer): Buffer {
        for (const injector of this.injectors) {
            body = injector(headers, body);
        }
        return body;
    }
}

// iOS service workers sporatically become unresponsive when the app is in the background
// injecting this into parent page HTML will prompt the user to restart the app
messenger.addListener(ClientMessageType.SW_MONITOR, () => {
    messenger.broadcastMessage({
        type: WorkerMessageType.SW_MONITOR,
    });
});

const injectSWMonitor: Injector = (headers, body) => {
    if (headers.get('content-type')?.startsWith('text/html')) {
        const [start, end] = body.toString().split('<head>');
        if (start && end) {
            const parts = [
                start,
                '<head>',
                `<script>
                    document.addEventListener("visibilitychange", () => {
                        console.log('visibilitychange', document.visibilityState, navigator.serviceWorker.controller?.state);
                        if (document.visibilityState === 'visible' && navigator.serviceWorker.controller?.state === 'activated') {
                            console.log('test service worker responsiveness');
                            navigator.serviceWorker.controller?.postMessage({
                                type: '${ClientMessageType.SW_MONITOR}'
                            });
                            const start = Date.now();
                            const timeout = setTimeout(() => {
                                alert('Service worker is unresponsive, please restart the app');
                            }, 1000);
                            navigator.serviceWorker.onmessage = (e) => {
                                if (e.data.type === '${WorkerMessageType.SW_MONITOR}') {
                                    console.log('Service worker is responsive', Date.now() - start);
                                    clearTimeout(timeout);
                                }
                            };
                        }
                    });
                </script>`,
                end,
            ];
            return Buffer.from(parts.join(''));
        }
    }
    return body;
};

export default new Injectors([injectSWMonitor]);
