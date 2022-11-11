import { render } from '@testing-library/react';
import React from 'react';

import { AppProvider, createLogic } from './logic';
import { createStore } from './store';

export const renderWithProviders = (children: React.ReactNode) =>
    render(
        <AppProvider store={createStore()} logic={createLogic()}>
            {children}
        </AppProvider>
    );
