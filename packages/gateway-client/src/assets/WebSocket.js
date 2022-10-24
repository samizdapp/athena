class SWebSocket {
    _url;
    _id;
    _channel;
    _buffer = [];
    _onmessage = evt => console.log('unimplemented', evt);

    set onmessage(handler) {
        this._onmessage = handler;
    }

    constructor(url, protocols) {
        console.log('websocket', url, protocols);
        this._channel = new MessageChannel();
        navigator.serviceWorker.controller.postMessage(
            { type: 'WEBSOCKET', url, protocols },
            [this._channel.port2]
        );
        this._channel.port1.onmessage = event => {
            console.log('onmessage, ', event);
            switch (event.data.type) {
                case 'MESSAGE':
                    this._onmessage(
                        new MessageEvent('message', { data: event.data })
                    );
                    break;
                case 'STATE':
                default:
                    console.warn('unknown type', event);
            }
        };
    }

    send(data) {
        console.log('send', data);
        this._channel.port1.postMessage(data);
    }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
window.WebSocket = SWebSocket;

const a = new WebSocket('ws://localhost:9999');

a.onmessage = console.log.bind(console);

a.send('test');
