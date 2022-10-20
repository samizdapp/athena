import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './globals.css';

import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';

import App from './app/app';
import { AppProvider, createLogic } from './app/redux/logic';
import { createStore } from './app/redux/store';
import createEmotionCache from './createEmotionCache';
import theme from './theme';
import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
    html, body {
        height: 100%;
    }

    #root {
        height: 100%;
    }

    * {
        &::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        &::-webkit-scrollbar-track {
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.1);
        }
        &::-webkit-scrollbar-thumb {
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.2);
        }
        &::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.4);
        }
        &::-webkit-scrollbar-thumb:active {
            background: rgba(0, 0, 0, 0.9);
        }
    }
`;

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
                        <GlobalStyle />
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
