export type WorkerVersionManifest = Partial<{
    root: WorkerVersion;
    app: WorkerVersion;
}>;

export type WorkerVersion = Partial<{
    version: string;
    commit: string;
    build: string;
    branch: string;
}>;

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
    UPDATE_WORKER = 'UPDATE_WORKER',
}

export type Message<T extends WorkerMessageType | ClientMessageType> = {
    type: T;
} & Record<string, unknown>;
