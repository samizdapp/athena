import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
    ServerPeerStatus,
    WorkerVersion,
    WorkerVersionManifest,
} from '../../../worker-messaging';

import { RootState } from '../store';

export interface WorkerState {
    status?: ServiceWorkerState;
    isControlling: boolean;
    serverPeerStatus?: ServerPeerStatus;
    boxAddresses: string[];
    versions: {
        gateway: WorkerVersion;
    } & WorkerVersionManifest;
}

const initialState: WorkerState = {
    isControlling: false,
    boxAddresses: [],
    versions: {
        gateway: {
            build: process.env.NX_BUILD_NUMBER,
            branch: process.env.NX_BUILD_BRANCH,
            commit: process.env.NX_BUILD_COMMIT,
            updateAvailable: false,
        },
    },
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
        setServerPeerStatus: (
            state,
            { payload: status }: PayloadAction<ServerPeerStatus>
        ) => {
            state.serverPeerStatus = status;
        },
        setRelayAddresses: (
            state,
            { payload: addresses }: PayloadAction<string[]>
        ) => {
            state.boxAddresses = addresses;
        },
        setVersions: (
            state,
            { payload: versions }: PayloadAction<WorkerVersionManifest>
        ) => {
            state.versions = {
                ...state.versions,
                ...versions,
            };
            // if worker version is newer than gateway version
            if (
                (state.versions.root?.build ?? 0) >
                    (state.versions.gateway.build ?? 0) ||
                (state.versions.app?.build ?? 0) >
                    (state.versions.gateway.build ?? 0)
            ) {
                // then there is an update available for the gateway
                state.versions.gateway.updateAvailable = true;
            }
        },
    },
});

export const {
    setIsControlling,
    setStatus,
    setServerPeerStatus,
    setRelayAddresses,
    setVersions,
} = serviceWorkerSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.serviceWorker.value)`
export const selectServiceWorker = (state: RootState) => state.serviceWorker;
export const selectWorkerStatus = createSelector(
    selectServiceWorker,
    state => ({
        status: state.status,
        isControlling: state.isControlling,
        serverPeerStatus: state.serverPeerStatus,
    })
);
export const selectRelayAddresses = createSelector(
    selectServiceWorker,
    state => state.boxAddresses
);
export const selectVersions = createSelector(
    selectServiceWorker,
    state => state.versions
);

export default serviceWorkerSlice;
