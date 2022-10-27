import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import serviceWorkerSlice from './service-worker/serviceWorker.slice';
import statusLogApi from './status-log/statusLog.api';

export const createStore = () => {
    const store = configureStore({
        reducer: {
            [serviceWorkerSlice.name]: serviceWorkerSlice.reducer,
            [statusLogApi.reducerPath]: statusLogApi.reducer,
        },
        middleware: getDefaultMiddleware =>
            getDefaultMiddleware().concat(statusLogApi.middleware),
    });

    return store;
};

export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];
export type RootState = ReturnType<AppStore['getState']>;
export type AppThunk<ReturnType = void> = ThunkAction<
    ReturnType,
    RootState,
    unknown,
    Action<string>
>;
