export enum ServerPeerStatus {
    BOOTSTRAPPED = 'BOOTSTRAPPED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    OFFLINE = 'OFFLINE',
}

export enum WorkerMessageType {
    SERVER_PEER_STATUS = 'SERVER_PEER_STATUS',
    LOADED_RELAYS = 'LOADED_RELAYS',
    HEARTBEAT = 'HEARTBEAT',
}

export enum ClientMessageType {
    REQUEST_STATUS = 'REQUEST_STATUS',
    OPENED = 'OPENED',
    HEARTBEAT = 'HEARTBEAT',
    WEBSOCKET = 'WEBSOCKET',
}

export type Message<T extends WorkerMessageType | ClientMessageType> = {
    type: T;
    ports?: MessagePort[];
} & Record<string, unknown>;
