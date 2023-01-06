import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import useTheme from '@mui/material/styles/useTheme';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { ClientMessageType, ServerPeerStatus } from '../../../worker-messaging';
import { selectWorkerStatus } from '../../redux/service-worker/serviceWorker.slice';
import {
    getSupportedPlatform,
    isPwa,
    isSupportedPlatform,
} from '../../support';
import ErasablePen from '../loading/erasable-pen';
import AnimatedCheck from './animated-check';
import AnimatedConnection from './animated-connection';
import Status from './worker';

const StyledHome = styled.div`
    overflow: hidden;
    height: 100%;

    .mui-box {
        overflow: hidden;
        height: 100%;
    }

    .status-graphic {
        text-align: center;

        .status-icon > * {
            margin-bottom: 20px;
            width: 80%;
        }

        .erasable-pen .loading {
            margin-top: -100px;
            height: 200px;
        }

        .animated-check svg {
            margin-top: 0;
            height: 100px;
        }

        .animated-connection svg {
            margin-top: -26px;
            margin-bottom: -26px;
            height: 150px;
        }
    }

    .status-message {
        text-align: center;

        a {
            color: #00aaff;
        }
    }
`;

const ErasablePenIcon = () => (
    <div className="status-icon erasable-pen">
        <ErasablePen primary="#086be4" secondary="#bfbfbf" />
    </div>
);

const AnimatedCheckIcon = () => (
    <div className="status-icon animated-check">
        <AnimatedCheck />
    </div>
);

const AnimatedConnectionIcon = () => (
    <div className="status-icon animated-connection">
        <AnimatedConnection />
    </div>
);

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
    const {
        isControlling,
        status: workerStatus,
        serverPeerStatus,
    } = useSelector(selectWorkerStatus);
    const secureContext = window.isSecureContext;
    const workerActive = workerStatus === 'activated' && isControlling;
    const pwaOpen = isPwa();

    const [statusMessage, setStatusMessage] =
        useState<React.ReactNode>('Loading...');
    const [statusIcon, setStatusIcon] = useState<React.ReactNode>(
        <ErasablePenIcon />
    );

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
                        href="https://samizdapp.github.io/docs/getting-started/install-client"
                        target="_blank"
                        rel="noreferrer"
                    >
                        insecure origin flag
                    </a>{' '}
                    set?)
                </>
            );
            setStatusIcon(<ErasablePenIcon />);
            return;
        } // else, we have a secure context

        // if we aren't activated and being controlled yet
        if (!workerActive) {
            // then keep waiting
            setStatusMessage('Installing...');
            setStatusIcon(<ErasablePenIcon />);
            return;
        } // else, we are now activated and are being controlled by the worker

        // if we aren't a PWA
        if (!pwaOpen) {
            // we need to be before we can continue
            setStatusMessage(
                <>
                    <a
                        href="https://samizdapp.github.io/docs/getting-started/install-client"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Install the PWA
                    </a>{' '}
                    to continue.
                </>
            );
            setStatusIcon(<AnimatedCheckIcon />);
            return;
        } // else, we are a PWA being controlled by an active worker

        // let the worker know we're up and running
        window.navigator.serviceWorker.controller?.postMessage({
            type: ClientMessageType.OPENED,
        });

        // if our worker doesn't have a connection yet
        if (serverPeerStatus === ServerPeerStatus.CONNECTING) {
            setStatusMessage('Connecting to your box...');
            setStatusIcon(<ErasablePenIcon />);
            return;
        }
        // if our worker is offline
        if (serverPeerStatus === ServerPeerStatus.OFFLINE) {
            setStatusMessage('Unable to connect to your box. Are you offline?');
            setStatusIcon(<AnimatedConnectionIcon />);
            return;
        }
        // if we're connected
        if (serverPeerStatus === ServerPeerStatus.CONNECTED) {
            // we've accomplished all we needed, time to go
            setStatusMessage('Redirecting to SamizdApp...');
            setStatusIcon(<AnimatedCheckIcon />);
            window.location.href = '/';
        }
    }, [pwaOpen, secureContext, serverPeerStatus, workerActive]);

    return (
        <StyledHome>
            <Box
                className="mui-box"
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
                                {statusIcon}

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
