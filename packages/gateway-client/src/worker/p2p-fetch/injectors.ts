import { ClientMessageType, WorkerMessageType } from '../../worker-messaging';
import messenger from '../messenger';
import { WebsocketStreamStatus } from '../p2p-client/stream-factory';

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

// HEARTBEAT Injector

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

const makeInjector =
    (content_type: string, split: string, snippet: string) =>
    (headers: Headers, body: Buffer) => {
        // check if the response is html
        if (headers.get('content-type')?.startsWith(content_type)) {
            const [start, end] = body.toString().split(split);
            // check if the response contains the <head> tag
            if (start && end) {
                const parts = [start, split, snippet, end];
                const newBody = Buffer.from(parts.join(''));
                // update the headers to have the correct content-length
                headers.set('content-length', newBody.byteLength.toString());
                return newBody;
            }
        }

        // if the response is not html or does not contain the <head> tag, return the original body
        return body;
    };

const WEBSOCKET_CONTENT_TYPE = 'text/html';

const WEBSOCKET_SPLIT = '<head>';

const WEBSOCKET_SNIPPET = `<script>
window.nativeWebSocket = window.WebSocket;
class SamizdappWebSocket {
    constructor(url, protocols) {
        return makeSamizdappWebSocket(url, protocols);
    }
}

function makeSamizdappWebSocket(url, protocols) {
    console.log('makeSamizdappWebSocket', url, protocols);
    const ws = Object.create(window.nativeWebSocket);

    const messageChannel = new MessageChannel();
    const statusChannel = new MessageChannel();
    const commandChannel = new MessageChannel();
    ws._messagePort = messageChannel.port1;
    ws._statusPort = statusChannel.port1;
    ws._commandPort = commandChannel.port1;

    ws._messagePort.onmessage = (e) => {
        console.log('message', e.data, new TextDecoder('ascii').decode(e.data));
        const newEvent = new MessageEvent(e.type, {
            ...e,
            data: String.raw\`\${new TextDecoder('ascii').decode(e.data)}\`
        });
        ws.onmessage?.(newEvent);
    }
    ws._statusPort.onmessage = (e) => {
        const {status, error} = JSON.parse(new TextDecoder('ascii').decode(e.data));
        console.log('status', status, error);
        if (error) {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.CLOSED,
                writable: false,
                configurable: true,
            });
            if (ws.onerror) {
                ws.onerror(error);
            } else {
                throw error;
            }
        } else if (status === '${WebsocketStreamStatus.OPENED}') {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.OPEN,
                writable: false,
                configurable: true,
            });
            return ws.onopen?.();
        } else if (status === '${WebsocketStreamStatus.CLOSED}') {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.CLOSED,
                writable: false,
                configurable: true,
            });
            return ws.onclose?.();
        }
    }

    const openCommand = new TextEncoder().encode(JSON.stringify({method: 'OPEN', detail: {url, protocols}}));
    
    if (navigator.serviceWorker.controller?.state === 'activated') {
        navigator.serviceWorker.controller.postMessage({
            type: '${ClientMessageType.WEBSOCKET}',
        }, [statusChannel.port2, messageChannel.port2, commandChannel.port2]);
        ws._commandPort.postMessage(openCommand, [openCommand.buffer]);
        Object.defineProperty(ws, 'readyState', {
            value: window.nativeWebSocket.CONNECTING,
            writable: false,
            configurable: true,
        });
    }

    ws.send = function(message) {
        message = typeof message === 'string' ? new TextEncoder().encode(message) : message;
        ws._messagePort.postMessage(message, [message.buffer]);
    }

    ws.close = function() {
        const closeCommand = new TextEncoder().encode(JSON.stringify({method: 'CLOSE'}));
        ws._commandPort.postMessage(closeCommand, [closeCommand.buffer]);
    }

    return ws
}
window.WebSocket = SamizdappWebSocket;
</script>
`;

export default new Injectors([
    makeInjector(HEARTBEAT_CONTENT_TYPE, HEARTBEAT_SPLIT, HEARTBEAT_SNIPPET),
    makeInjector(WEBSOCKET_CONTENT_TYPE, WEBSOCKET_SPLIT, WEBSOCKET_SNIPPET),
]);
