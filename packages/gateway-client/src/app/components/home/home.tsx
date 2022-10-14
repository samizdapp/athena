import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import useTheme from '@mui/material/styles/useTheme';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { selectServiceWorker } from '../../redux/service-worker/serviceWorker.slice';
import { isPwa } from '../../support';

import CircularIndeterminate from '../loading/circular-indeterminate';

/* eslint-disable-next-line */
export interface HomeProps {}

const StyledHome = styled.div``;

export function Home(_props: HomeProps) {
    const theme = useTheme();
    const { isControlling, status: workerStatus } =
        useSelector(selectServiceWorker);
    const [statusMessage, setStatusMessage] = useState('Loading...');
    const pwaOpen = isPwa();

    const [time, setTime] = useState(0);

    useEffect(() => {
        console.log({ workerStatus, isControlling, pwaOpen });

        // if we aren't activated and being controlled yet
        if (workerStatus !== 'activated' || !isControlling) {
            // then keep waiting
            return;
        }
        // else, we are now activated and are being controlled by the worker

        // if we aren't a PWA
        if (!pwaOpen) {
            // we need to be before we can continue
            setStatusMessage('Install the PWA to continue.');
            return;
        }
        // else, we are a PWA being controlled by an active worker

        // let the worker know we're up and running
        window.navigator.serviceWorker.controller?.postMessage({
            type: 'START',
        });
        // we've accomplished all we needed, time to go
        window.location.href = '/';
    }, [isControlling, workerStatus, pwaOpen]);

    // refresh this component periodically to check for external changes (like the PWA opening)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setTime(time + 1000);
        });

        return () => clearTimeout(timeoutId);
    }, [time]);

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
                        <p>Status: {workerStatus ?? 'pending'}</p>
                        <p>Controlling: {isControlling ? 'yes' : 'no'}</p>

                        <CircularIndeterminate />

                        <p>{statusMessage}</p>
                    </Paper>
                </Container>
            </Box>
        </StyledHome>
    );
}

export default Home;
