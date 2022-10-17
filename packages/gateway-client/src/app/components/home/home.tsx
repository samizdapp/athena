import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import useTheme from '@mui/material/styles/useTheme';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { selectWorkerStatus } from '../../redux/service-worker/serviceWorker.slice';
import {
    getSupportedPlatform,
    isPwa,
    isSupportedPlatform,
} from '../../support';
import CircularIndeterminate from '../loading/circular-indeterminate';
import Status from './status';

const StyledHome = styled.div``;

const useReload = () => {
    const [_, reload] = useState(0);
    return () => {
        reload(Date.now());
    };
};

/* eslint-disable-next-line */
export interface HomeProps {}

export function Home(_props: HomeProps) {
    const theme = useTheme();
    const [recommended, setRecommended] = useState('');
    const { isControlling, status: workerStatus } =
        useSelector(selectWorkerStatus);
    const secureContext = window.isSecureContext;
    const [statusMessage, setStatusMessage] = useState('Loading...');
    const pwaOpen = isPwa();

    const reload = useReload();

    const handleVisibilityChange = useCallback(() => {
        reload();
    }, [reload]);

    useEffect(() => {
        if (!isSupportedPlatform()) {
            setRecommended(getSupportedPlatform());
        }
    }, []);

    useEffect(() => {
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () =>
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange
            );
    }, [handleVisibilityChange]);

    useEffect(() => {
        console.log({ workerStatus, isControlling, pwaOpen, secureContext });

        // if we aren't in a secure context
        if (!secureContext) {
            // then there is no point in even trying
            setStatusMessage(
                'Missing secure context. (Is insecure origin flag set?)'
            );
            return;
        } // else, we have a secure context

        // if we aren't activated and being controlled yet
        if (workerStatus !== 'activated' || !isControlling) {
            // then keep waiting
            setStatusMessage('Installing...');
            return;
        } // else, we are now activated and are being controlled by the worker

        // if we aren't a PWA
        if (!pwaOpen) {
            // we need to be before we can continue
            setStatusMessage('Install the PWA to continue.');
            return;
        } // else, we are a PWA being controlled by an active worker

        // let the worker know we're up and running
        window.navigator.serviceWorker.controller?.postMessage({
            type: 'START',
        });
        // we've accomplished all we needed, time to go
        window.location.href = '/';
    }, [isControlling, workerStatus, pwaOpen, secureContext]);

    return (
        <StyledHome>
            <Box
                sx={{
                    width: '100%',
                    backgroundColor: theme.palette.grey[200],
                }}
            >
                <Container
                    maxWidth={'sm'}
                    style={{
                        marginTop: theme.spacing(16),
                    }}
                >
                    <Paper
                        elevation={3}
                        style={{
                            padding: theme.spacing(2),
                        }}
                    >
                        {recommended ? (
                            <h1>Please open this page in {recommended}</h1>
                        ) : (
                            <>
                                <CircularIndeterminate />

                                <p>{statusMessage}</p>
                            </>
                        )}
                    </Paper>
                </Container>
            </Box>

            <Status />
        </StyledHome>
    );
}

export default Home;
