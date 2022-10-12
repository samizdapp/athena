type EnhancedBuffer = {
    json: {
        res: {
            headers: HeadersInit | Headers;
        } & Response;
    } & Record<string, unknown>;
    body: BodyInit;
} & Buffer;

declare module 'lob-enc' {
    export const decode: (bin: unknown) => EnhancedBuffer;
    export const encode: (head: unknownm, body: unknown) => EnhancedBuffer;
}
