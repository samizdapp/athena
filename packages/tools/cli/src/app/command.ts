export type Command<
    T extends Record<string | number, unknown> = Record<
        string | number,
        unknown
    >
> = (argv: T, signal: AbortSignal) => Promise<void>;
