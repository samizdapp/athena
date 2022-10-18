export enum ServerPeerStatus {
    BOOTSTRAPPED = 'BOOTSTRAPPED',
    STARTED = 'STARTED',
    CONNECTED = 'CONNECTED',
}

export enum MessageType {
    SERVER_PEER_STATUS = 'SERVER_PEER_STATUS',
    LOADED_RELAYS = 'LOADED_RELAYS',
}

export type Message = {
    type: MessageType;
} & Record<string, unknown>;
