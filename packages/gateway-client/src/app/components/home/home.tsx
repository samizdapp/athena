import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import useTheme from '@mui/material/styles/useTheme';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { ClientMessageType } from '../../../service-worker';
import { selectWorkerStatus } from '../../redux/service-worker/serviceWorker.slice';
import {
    getSupportedPlatform,
    isPwa,
    isSupportedPlatform,
} from '../../support';
import ErasablePen from '../loading/erasable-pen';
import AnimatedCheck from './animated-check';
import Status from './status';

const StyledHome = styled.div`
    .status-graphic {
        .loading,
        svg {
            margin-bottom: 20px;
            width: 80%;
        }

        .loading {
            margin-top: -100px;
            height: 200px;
        }

        svg {
            margin-top: 0;
            height: 100px;
        }
    }

    .status-message {
        text-align: center;

        a {
            color: #00aaff;
        }
    }
`;

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
    const workerActive = workerStatus === 'activated' && isControlling;
    const [statusMessage, setStatusMessage] =
        useState<React.ReactNode>('Loading...');
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
        console.log({ workerActive, pwaOpen, secureContext });

        // if we aren't in a secure context
        if (!secureContext) {
            // then there is no point in even trying
            setStatusMessage(
                <>
                    Missing secure context. (Is the{' '}
                    <a
                        href="https://samizdapp.github.io/docs/getting-started/setup-client"
                        target="_blank"
                        rel="noreferrer"
                    >
                        insecure origin flag
                    </a>{' '}
                    set?)
                </>
            );
            return;
        } // else, we have a secure context

        // if we aren't activated and being controlled yet
        if (!workerActive) {
            // then keep waiting
            setStatusMessage('Installing...');
            return;
        } // else, we are now activated and are being controlled by the worker

        // if we aren't a PWA
        if (!pwaOpen) {
            // we need to be before we can continue
            setStatusMessage(
                <>
                    <a
                        href="https://samizdapp.github.io/docs/getting-started/setup-client"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Install the PWA
                    </a>{' '}
                    to continue.
                </>
            );
            return;
        } // else, we are a PWA being controlled by an active worker

        // let the worker know we're up and running
        window.navigator.serviceWorker.controller?.postMessage({
            type: ClientMessageType.OPENED,
        });
        // we've accomplished all we needed, time to go
        window.location.href = '/';
    }, [pwaOpen, secureContext, workerActive]);

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
                            <div className="status-graphic">
                                {!workerActive ? (
                                    <ErasablePen
                                        primary="#086be4"
                                        secondary="#bfbfbf"
                                    />
                                ) : (
                                    <AnimatedCheck />
                                )}

                                <p className="status-message">
                                    {statusMessage}
                                </p>
                            </div>
                        )}
                    </Paper>
                </Container>
            </Box>

            <Status />
        </StyledHome>
    );
}

export default Home;
