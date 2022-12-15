import { Stream } from '@libp2p/interface-connection';
import { RawStream } from './raw';
import { LobStream } from './lob';
import { WebsocketStream } from './websocket';
import { HeartbeatStream } from './heartbeat';
import { RequestStream, StreamPool } from './request';
import { NativeRequestStream } from './native-request';

export type StreamConstructor = new (
    raw: Stream,
    ports?: MessagePort[]
) => SamizdappStream;

export type SamizdappStream =
    | RawStream
    | RequestStream
    | LobStream
    | WebsocketStream
    | HeartbeatStream
    | NativeRequestStream;

export {
    RawStream,
    StreamPool,
    RequestStream,
    LobStream,
    WebsocketStream,
    HeartbeatStream,
    NativeRequestStream,
};
