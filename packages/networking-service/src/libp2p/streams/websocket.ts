import { Packet, encode } from './lob/lob-enc';
import { LobStream } from './lob';
import { WebSocket } from 'ws';
import { Debug } from '../../logging';

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
    protected override readonly log = new Debug('libp2p-websocket-stream');

    private ws: WebSocket | null = null;

    private readonly streamMessageHandlers = {
        [WebsocketStreamMessageType.COMMAND]: this.handleCommand.bind(this),
        [WebsocketStreamMessageType.MESSAGE]: this.handleMessage.bind(this),
        [WebsocketStreamMessageType.STATUS]: this.handleStatus.bind(this),
    };

    async handleCommand({ body }: { body: Buffer }) {
        try {
            this.log.debug('handle command', body.toString(), this.peer);
            const { method, detail } = JSON.parse(body.toString());
            console.log('handle command', method, detail);
            switch (method) {
                case 'OPEN':
                    this.openWebsocket(detail);
                    break;
                case 'CLOSE':
                    this.closeWebsocket();
                    break;
                default:
                    this.log.error('unknown method', method);
            }
        } catch (error) {
            this.log.error('handleCommand error', error);
        }
    }

    encodeMessageToPacket(type: WebsocketStreamMessageType, buffer: Buffer) {
        return encode({ type, bodyLength: buffer.byteLength }, buffer);
    }

    async openWebsocket({
        url,
        protocols,
    }: {
        url: string;
        protocols: string[];
    }) {
        this.log.info('open websocket', url, this.peer);
        const ws = new WebSocket(url, protocols);
        ws.onopen = event => {
            this.log.debug('websocket opened');
            this.sendStatus({
                status: WebsocketStreamStatus.OPENED,
                detail: event,
            });
        };
        ws.onclose = () => {
            this.log.debug('websocket closed', this.peer);
            this.sendStatus({
                status: WebsocketStreamStatus.CLOSED,
                detail: {
                    code: 1000,
                    wasClean: true,
                    reason: 'closed',
                },
            });
        };
        ws.onerror = error => {
            this.log.debug('websocket error', this.peer);
            this.sendStatus({
                status: WebsocketStreamStatus.ERROR,
                detail: error,
            });
        };
        ws.onmessage = evt => {
            this.log.trace('websocket message', evt.data);
            const body =
                evt.data instanceof Buffer
                    ? evt.data
                    : Buffer.from(evt.data as unknown as string, 'ascii');
            const packet = this.encodeMessageToPacket(
                WebsocketStreamMessageType.STATUS,
                body
            );
            this.send(packet);
        };
        this.ws = ws;
    }

    async sendStatus({
        status,
        detail,
    }: {
        status: WebsocketStreamStatus;
        detail: object;
    }) {
        this.log.debug('send status', status, detail, this.peer);
        const packet = this.encodeMessageToPacket(
            WebsocketStreamMessageType.STATUS,
            Buffer.from(
                JSON.stringify({
                    status,
                    detail: JSON.parse(JSON.stringify(detail)),
                })
            )
        );
        this.send(packet);
    }

    async closeWebsocket() {
        this.log.info('close websocket');
        this.ws?.close();
    }

    handleMessage({ body }: { body: Buffer }) {
        try {
            this.log.trace('handle message', body);
            this.ws?.send(body);
        } catch (error) {
            this.log.debug('handleMessage error', error);
        }
    }

    handleStatus({ body }: { body: Buffer }) {
        this.log.error(
            'websocket handle status should not be called on server',
            body
        );
    }

    async dispatch(packet: Packet) {
        const type = packet.json.type as WebsocketStreamMessageType;
        if (!this.streamMessageHandlers[type]) {
            this.log.error('websocket message unknown type', type);
            return;
        }

        this.streamMessageHandlers[type](packet);
    }

    async init() {
        this.log.info('init websocket');
        while (this.isOpen) {
            const packet = await this.receive();
            if (packet) {
                await this.dispatch(packet);
            } else {
                console.log('read null packet');
                this.close();
            }
        }
        this.log.info('websocket closed');
    }
}
