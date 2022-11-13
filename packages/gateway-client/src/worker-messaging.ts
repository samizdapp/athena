export enum ServerPeerStatus {
    BOOTSTRAPPED = 'BOOTSTRAPPED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    OFFLINE = 'OFFLINE',
}

export enum WorkerMessageType {
    SERVER_PEER_STATUS = 'SERVER_PEER_STATUS',
    LOADED_RELAYS = 'LOADED_RELAYS',
}

export enum ClientMessageType {
    REQUEST_STATUS = 'REQUEST_STATUS',
    OPENED = 'OPENED',
}

export type Message<T extends WorkerMessageType | ClientMessageType> = {
    type: T;
} & Record<string, unknown>;
