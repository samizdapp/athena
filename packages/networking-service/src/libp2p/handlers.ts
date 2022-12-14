import node from './node';
import { ProxyStream2 } from './streams/proxy.2';
import { WebsocketStream } from './streams/websocket';
import { RelayStream } from './streams/relay';
import { HeartbeatStream, HeartbeatType } from './streams/heartbeat';
import { Stream, Connection } from '@libp2p/interface-connection';
import { Debug } from '../logging';

class Handlers {
    private readonly log = new Debug('libp2p-handlers');

    constructor() {
        node.handleProtocol(
            '/samizdapp-proxy/2.0.0',
            this.handleProxy2.bind(this),
            {
                maxInboundStreams: 100,
            }
        );

        node.handleProtocol(
            '/samizdapp-websocket',
            this.handleWebsocket.bind(this),
            {
                maxInboundStreams: 100,
            }
        );

        node.handleProtocol(
            '/samizdapp-heartbeat',
            this.handleHeartbeat.bind(this),
            {
                maxInboundStreams: 100,
            }
        );

        node.handleProtocol('/samizdapp-relay', this.handleRelay.bind(this), {
            maxInboundStreams: 100,
        });
    }

    private async handleProxy2({
        stream,
        connection,
    }: {
        stream: Stream;
        connection: Connection;
    }) {
        stream.metadata = {
            peer: connection.remotePeer,
        };
        this.log.debug('handle proxy2', stream);
        const proxyStream = new ProxyStream2(stream);
        await proxyStream.init();
    }

    private async handleWebsocket({
        stream,
        connection,
    }: {
        stream: Stream;
        connection: Connection;
    }) {
        stream.metadata = {
            peer: connection.remotePeer,
        };
        this.log.debug('handle websocket', stream);
        const websocketStream = new WebsocketStream(stream);
        await websocketStream.init();
    }

    private async handleHeartbeat({
        stream,
        connection,
    }: {
        stream: Stream;
        connection: Connection;
    }) {
        stream.metadata = {
            peer: connection.remotePeer,
            type: HeartbeatType.SENDER,
        };
        this.log.debug('handle heartbeat', stream.metadata.peer.toString());
        const heartbeatStream = new HeartbeatStream(
            stream,
            HeartbeatType.SENDER
        );
        await heartbeatStream.init();
    }

    private async handleRelay({
        stream,
        connection,
    }: {
        stream: Stream;
        connection: Connection;
    }) {
        stream.metadata = {
            peer: connection.remotePeer,
        };
        this.log.debug('handle relay', stream);
        const relayStream = new RelayStream(stream);
        await relayStream.init();
    }
}

export default new Handlers();
