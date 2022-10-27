export type GenericOptions = {
    pollingInterval?: number;
};

type GenericQueryHook<T, R> = (
    arg: '',
    options: GenericOptions & {
        selectFromResult: (result: { data?: T }) => { data: R };
    }
) => { data: R };

export const createApiDataSelector =
    <
        T = unknown,
        R extends Record<string, unknown> = Record<string, unknown>,
        Q extends GenericQueryHook<T, R> = GenericQueryHook<T, R>
    >(
        useQueryHook: Q,
        selector: (data?: T) => R
    ) =>
    (options?: GenericOptions) =>
        useQueryHook('', {
            ...options,
            selectFromResult: ({ data }) => ({ data: selector(data) }),
        });
