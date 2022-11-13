import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ServerPeerStatus } from '../../../worker-messaging';

import { RootState } from '../store';

/**
 * Service worker lifecycle:
 *
 * 1. Executed
 * 2. Get server peer:
 *   a. Fetch bootstrap address
 *   b. Fetch relay list
 *   c. Start libp2p node (w/ autodial effectively disabled)
 *   d. Connect (probably) to peers on peer:discovery event
 *   e. Receive peer:connect event filtered to be our server (self.serverPeer)
 * 3. Get list of relays:
 *   a. Open stream to `/samizdapp-relay`
 *   b. For each received address:
 *     i. Add to stored relay list
 *     ii. Add to libp2p node address book
 *
 */

/**
 * Service worker actions:
 *
 * - Make a fetch request:
 *   - Waits on lifecycle: (2. Get server peer)
 *   - Sends request through p2p stream
 *
 * - Receive a message:
 *   - Set started true
 */

export interface WorkerState {
    status?: ServiceWorkerState;
    isControlling: boolean;
    serverPeerStatus?: ServerPeerStatus;
    relayAddresses: string[];
}

const initialState: WorkerState = {
    isControlling: false,
    relayAddresses: [],
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
            state.relayAddresses = addresses;
        },
    },
});

export const {
    setIsControlling,
    setStatus,
    setServerPeerStatus,
    setRelayAddresses,
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
    state => state.relayAddresses
);

export default serviceWorkerSlice;
