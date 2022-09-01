type EnhancedBuffer = {
    json: Record<string, unknown>;
    body: Record<string, unknown>;
} & Buffer;

declare module 'lob-enc' {
    export const decode: (bin: unknown) => EnhancedBuffer;
    export const encode: (head: unknownm, body: unknown) => EnhancedBuffer;
}
