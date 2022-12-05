import { CompiledInjector } from './injectors';
import { WebsocketStreamStatus } from '../p2p-client/streams';
import { ClientMessageType } from '../../worker-messaging';

const WEBSOCKET_CONTENT_TYPE = 'text/html';

const WEBSOCKET_SPLIT = '<head>';

const WEBSOCKET_SNIPPET = `<script>
window.nativeWebSocket = window.WebSocket;
// create a class so we can use 'new'
class SamizdappWebSocket {
    constructor(url, protocols) {
        return makeSamizdappWebSocket(url, protocols);
    }
}

function makeSamizdappWebSocket(url, protocols) {
    // create a real websocket object
    const ws = Object.create(window.nativeWebSocket);

    const messageChannel = new MessageChannel();
    const statusChannel = new MessageChannel();
    const commandChannel = new MessageChannel();
    ws._messagePort = messageChannel.port1;
    ws._statusPort = statusChannel.port1;
    ws._commandPort = commandChannel.port1;

    ws._messagePort.onmessage = (e) => {
        const newEvent = new MessageEvent(e.type, {
            ...e,
            data: String.raw\`\${new TextDecoder('ascii').decode(e.data)}\`
        });
        ws.onmessage?.(newEvent);
    }
    ws._statusPort.onmessage = (e) => {
        const {status, detail} = JSON.parse(new TextDecoder('ascii').decode(e.data));
        if (error) {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.CLOSED,
                writable: false,
                configurable: true,
            });
            if (ws.onerror) {
                ws.onerror(new Error(detail.message, detail));
            } else {
                throw error;
            }
        } else if (status === '${WebsocketStreamStatus.OPENED}') {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.OPEN,
                writable: false,
                configurable: true,
            });
            return ws.onopen?.(new Event(detail.type, detail));
        } else if (status === '${WebsocketStreamStatus.CLOSED}') {
            Object.defineProperty(ws, 'readyState', {
                value: window.nativeWebSocket.CLOSED,
                writable: false,
                configurable: true,
            });
            return ws.onclose?.(new CloseEvent(detail.type, detail));
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
        Object.defineProperty(ws, 'readyState', {
            value: window.nativeWebSocket.CLOSING,
            writable: false,
            configurable: true,
        });
        const closeCommand = new TextEncoder().encode(JSON.stringify({method: 'CLOSE'}));
        ws._commandPort.postMessage(closeCommand, [closeCommand.buffer]);
    }

    return ws
}
window.WebSocket = SamizdappWebSocket;
</script>
`;

export default new CompiledInjector(
    WEBSOCKET_CONTENT_TYPE,
    WEBSOCKET_SPLIT,
    WEBSOCKET_SNIPPET
);
