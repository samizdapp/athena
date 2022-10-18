import React, { createContext, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { ServiceWorkerLogic } from './service-worker/serviceWorker.logic';
import { AppStore } from './store';

export const createLogic = () => ({
    serviceWorker: new ServiceWorkerLogic(),
});

export type AppLogic = ReturnType<typeof createLogic>;

type AppContextType = {
    logic: AppLogic;
};

export const AppContext = createContext<AppContextType | void>(undefined);

type ProviderProps = {
    store: AppStore;
    logic: AppLogic;
    children: ReactNode;
};

export const AppProvider = ({ store, logic, children }: ProviderProps) => (
    <AppContext.Provider value={{ logic }}>
        <Provider store={store}>{children}</Provider>
    </AppContext.Provider>
);
