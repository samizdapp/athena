import { CompiledTransformer } from './transformers';
import messenger from '../messenger';
import { WorkerMessageType, ClientMessageType } from '../../worker-messaging';

// HEARTBEAT Transformer

// iOS service workers sporatically become unresponsive when the app is in the background
// this injector injects a script into any html page that will check for responsiveness
// and prompt the user to restart the app if the service worker is unresponsive

// responsiveness is tested by echoing a message back to the parent page
messenger.addListener(ClientMessageType.HEARTBEAT, () => {
    messenger.broadcastMessage({
        type: WorkerMessageType.HEARTBEAT,
    });
});

// we want to inject this script into the parent page at the very top of the <head> tag
const HEARTBEAT_SPLIT = '<head>';
const HEARTBEAT_CONTENT_TYPE = 'text/html';

// this is the script that will be injected, it issues a postMessage to the service worker
// when the document becomes visible, and listens for a response within 1 second
const HEARTBEAT_SNIPPET = `<script>
    if (navigator.userAgent.includes('iPhone')) {
        document.addEventListener("visibilitychange", () => {
            console.log('visibilitychange', document.visibilityState, navigator.serviceWorker.controller?.state);
            if (document.visibilityState === 'visible' && navigator.serviceWorker.controller?.state === 'activated') {
                console.log('test service worker responsiveness');
                navigator.serviceWorker.controller?.postMessage({
                    type: '${ClientMessageType.HEARTBEAT}'
                });
                const start = Date.now();
                const timeout = setTimeout(() => {
                    alert('Service worker is unresponsive, please restart the app');
                }, 1000);
                navigator.serviceWorker.onmessage = (e) => {
                    if (e.data.type === '${WorkerMessageType.HEARTBEAT}') {
                        console.log('Service worker is responsive', Date.now() - start);
                        clearTimeout(timeout);
                    }
                };
            }
        });
    }
</script>`;

export default new CompiledTransformer(
    HEARTBEAT_CONTENT_TYPE,
    HEARTBEAT_SPLIT,
    HEARTBEAT_SNIPPET
);
