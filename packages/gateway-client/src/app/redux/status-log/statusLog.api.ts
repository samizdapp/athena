import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { LogDto } from '@athena/shared/api';

import { createApiDataSelector, GenericOptions } from './rtk-api';

// Define a service using a base URL and expected endpoints
export const statusLogsApi = createApi({
    reducerPath: 'statusLogsApi',
    baseQuery: fetchBaseQuery({ baseUrl: '/smz/api/status' }),
    endpoints: builder => ({
        getStatusLogs: builder.query<LogDto.Log[], string>({
            query: () => `/logs`,
            transformResponse: (response: LogDto.Log[]) => {
                return response.filter(
                    log =>
                        Date.parse(log.createdAt) >= Date.now() - 1000 * 60 * 5
                );
            },
        }),
    }),
});

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const { useGetStatusLogsQuery } = statusLogsApi;

export const useSelectStatusLogsByService = createApiDataSelector<
    LogDto.Log[],
    Record<string, LogDto.Log[]>,
    typeof useGetStatusLogsQuery
>(
    useGetStatusLogsQuery,
    logs =>
        logs?.reduce<Record<string, LogDto.Log[]>>((indexed, log) => {
            (indexed[log.service] ?? (indexed[log.service] = [])).push(log);
            return indexed;
        }, {}) ?? {}
);

export const useSelectServiceLogs = (
    service: string,
    options?: GenericOptions
) => useSelectStatusLogsByService(options).data[service];

export default statusLogsApi;
