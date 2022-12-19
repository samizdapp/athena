declare module 'dbus-native' {
    export type BodyEntry = string | number | null;

    export interface Message {
        path: string;
        destination: string;
        member: string;
        interface: string;
        body?: BodyEntry[];
        signature?: string;
    }

    export interface Bus {
        invoke: (
            message: Message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: (error: Error, response: any) => void
        ) => void;
    }

    export function systemBus(): Bus;
}
