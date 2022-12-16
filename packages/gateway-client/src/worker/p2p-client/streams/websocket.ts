import { Stream } from '@libp2p/interface-connection';
import { logger } from '../../logging';
import { encode, Packet } from '../../p2p-fetch/lob-enc';
import { LobStream } from './lob';

export enum WebsocketStreamMessageType {
    COMMAND = 'COMMAND',
    MESSAGE = 'MESSAGE',
    STATUS = 'STATUS',
}

export enum WebsocketStreamStatus {
    OPENED = 'OPENED',
    CLOSED = 'CLOSED',
    ERROR = 'ERROR',
}

export class WebsocketStream extends LobStream {
    protected override readonly log = logger.getLogger(
        'worker/p2p-client/streams/websocket'
    );

    private portMap: Record<WebsocketStreamMessageType, MessagePort>;

    constructor(libp2pStream: Stream, ports: MessagePort[]) {
        super(libp2pStream);
        this.portMap = {
            [WebsocketStreamMessageType.STATUS]: ports[0],
            [WebsocketStreamMessageType.MESSAGE]: ports[1],
            [WebsocketStreamMessageType.COMMAND]: ports[2],
        };
        this.startSending();
        this.startReceiving();
    }

    private makePortMessageHandler(type: WebsocketStreamMessageType) {
        return (event: MessageEvent) => {
            this.log.debug(`${type}`, event.data);
            const message = this.encodeMessageToPacket(
                type,
                Buffer.from(event.data)
            );
            this.send(message);
        };
    }

    private startSending() {
        for (const [type, port] of Object.entries(this.portMap)) {
            port.onmessage = this.makePortMessageHandler(
                type as WebsocketStreamMessageType
            );
        }
    }

    private async startReceiving() {
        let packet = null;

        while (this.isOpen && (packet = await this.receive()) !== null) {
            this.dispatch(packet);
        }

        this.log.debug('websocket stream stopped receiving data');

        this.dispatchStatus(
            WebsocketStreamStatus.CLOSED,
            JSON.stringify({
                code: 1001,
                reason: 'Stream closed',
                wasClean: true,
            })
        );
    }

    private encodeMessageToPacket(
        type: WebsocketStreamMessageType,
        buffer: Buffer
    ): Packet {
        return encode({ type, bodyLength: buffer.byteLength }, buffer);
    }

    private getClientPort(type: WebsocketStreamMessageType): MessagePort {
        const port = this.portMap[type];
        if (!port) {
            throw new Error(`No port for type ${type}`);
        }
        return port;
    }

    private dispatch(packet: Packet): void {
        this.log.debug('dispatch', packet.json.type);
        this.getClientPort(
            packet.json.type as WebsocketStreamMessageType
        ).postMessage(packet.body, [packet.body.buffer]);
    }

    private dispatchStatus(
        status: WebsocketStreamStatus,
        detail?: string
    ): void {
        const body = Buffer.from(JSON.stringify({ status, detail }));
        this.getClientPort(WebsocketStreamMessageType.STATUS).postMessage(
            body,
            [body.buffer]
        );
    }
}
