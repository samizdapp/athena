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

// SW_HEARTBEAT Injector

// iOS service workers sporatically become unresponsive when the app is in the background
// this injector injects a script into any html page that will check for responsiveness
// and prompt the user to restart the app if the service worker is unresponsive

// responsiveness is tested by echoing a message back to the parent page
messenger.addListener(ClientMessageType.SW_HEARTBEAT, () => {
    messenger.broadcastMessage({
        type: WorkerMessageType.SW_HEARTBEAT,
    });
});

// we want to inject this script into the parent page at the very top of the <head> tag
const SW_HEARTBEAT_SPLIT = '<head>';

// this is the script that will be injected, it issues a postMessage to the service worker
// when the document becomes visible, and listens for a response within 1 second
const SW_HEARTBEAT_SNIPPET = `<script>
    if (navigator.userAgent.includes('iPhone')) {
        document.addEventListener("visibilitychange", () => {
            console.log('visibilitychange', document.visibilityState, navigator.serviceWorker.controller?.state);
            if (document.visibilityState === 'visible' && navigator.serviceWorker.controller?.state === 'activated') {
                console.log('test service worker responsiveness');
                navigator.serviceWorker.controller?.postMessage({
                    type: '${ClientMessageType.SW_HEARTBEAT}'
                });
                const start = Date.now();
                const timeout = setTimeout(() => {
                    alert('Service worker is unresponsive, please restart the app');
                }, 1000);
                navigator.serviceWorker.onmessage = (e) => {
                    if (e.data.type === '${WorkerMessageType.SW_HEARTBEAT}') {
                        console.log('Service worker is responsive', Date.now() - start);
                        clearTimeout(timeout);
                    }
                };
            }
        });
    }
</script>`;

// this is the injector function that will be called for each response
const injectSWHeartbeat: Injector = (headers, body) => {
    // check if the response is html
    if (headers.get('content-type')?.startsWith('text/html')) {
        const [start, end] = body.toString().split(SW_HEARTBEAT_SPLIT);
        // check if the response contains the <head> tag
        if (start && end) {
            const parts = [
                start,
                SW_HEARTBEAT_SPLIT,
                SW_HEARTBEAT_SNIPPET,
                end,
            ];
            const newBody = Buffer.from(parts.join(''));
            // update the headers to have the correct content-length
            headers.set('content-length', newBody.byteLength.toString());
            return newBody;
        }
    }

    // if the response is not html or does not contain the <head> tag, return the original body
    return body;
};

export default new Injectors([injectSWHeartbeat]);
