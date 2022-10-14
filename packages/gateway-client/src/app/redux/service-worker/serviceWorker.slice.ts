import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';

import { RootState } from '../store';

export interface WorkerState {
    status?: ServiceWorkerState;
    isControlling: boolean;
}

const initialState: WorkerState = {
    isControlling: false,
};

export const serviceWorkerSlice = createSlice({
    name: 'serviceWorker',
    initialState,
    // The `reducers` field lets us define reducers and generate associated actions
    reducers: {
        setStatus: (
            state,
            { payload: status }: PayloadAction<ServiceWorkerState>
        ) => {
            state.status = status;
        },
        setIsControlling: (
            state,
            { payload: isControlling }: PayloadAction<boolean>
        ) => {
            state.isControlling = isControlling;
        },
    },
});

export const { setIsControlling, setStatus } = serviceWorkerSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.serviceWorker.value)`
export const selectServiceWorker = (state: RootState) => state.serviceWorker;
export const selectStatus = createSelector(
    selectServiceWorker,
    state => state.status
);

export default serviceWorkerSlice.reducer;
