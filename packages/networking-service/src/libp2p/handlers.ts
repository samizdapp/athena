import node from './node';
import { ProxyStream2 } from './streams/proxy.2';
import { WebsocketStream } from './streams/websocket';
import { RelayStream } from './streams/relay';
import { HeartbeatStream, HeartbeatType } from './streams/heartbeat';
import { Stream } from '@libp2p/interface-connection';

class Handlers {
    constructor() {
        node.handleProtocol(
            '/samizdapp-proxy/2.0.0',
            this.handleProxy2.bind(this)
        );

        node.handleProtocol(
            '/samizdapp-websocket',
            this.handleWebsocket.bind(this)
        );

        node.handleProtocol(
            '/samizdapp-heartbeat',
            this.handleHeartbeat.bind(this)
        );

        node.handleProtocol('/samizdapp-relay', this.handleRelay.bind(this));
    }

    private async handleProxy2({ stream }: { stream: Stream }) {
        console.debug('proxy2', stream);
        const proxyStream = new ProxyStream2(stream);
        await proxyStream.init();
    }

    private async handleWebsocket({ stream }: { stream: Stream }) {
        console.debug('websocket', stream);
        const websocketStream = new WebsocketStream(stream);
        await websocketStream.init();
    }

    private async handleHeartbeat({ stream }: { stream: Stream }) {
        console.debug('heartbeat', stream);
        const heartbeatStream = new HeartbeatStream(
            stream,
            HeartbeatType.SENDER
        );
        await heartbeatStream.init();
    }

    private async handleRelay({ stream }: { stream: Stream }) {
        console.debug('relay', stream);
        const relayStream = new RelayStream(stream);
        await relayStream.init();
    }
}

export default new Handlers();
