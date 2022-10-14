import { register } from '@athena/shared/service-worker';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './globals.css';

import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';

import createEmotionCache from './createEmotionCache';
import theme from './theme';
import App from './app/app';
import { AppProvider, createLogic } from './app/redux/logic';
import { createStore } from './app/redux/store';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

const store = createStore();
const logic = createLogic();

root.render(
    <StrictMode>
        <AppProvider store={store} logic={logic}>
            <BrowserRouter>
                <CacheProvider value={createEmotionCache()}>
                    <ThemeProvider theme={theme}>
                        {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
                        <CssBaseline />
                        <App />
                    </ThemeProvider>
                </CacheProvider>
            </BrowserRouter>
        </AppProvider>
    </StrictMode>
);

store.dispatch(
    logic.serviceWorker.registerServiceWorker.bind(logic.serviceWorker)
);
