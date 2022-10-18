import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import serviceWorkerReducer from './service-worker/serviceWorker.slice';

export const createStore = () => {
    const store = configureStore({
        reducer: {
            serviceWorker: serviceWorkerReducer,
        },
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
