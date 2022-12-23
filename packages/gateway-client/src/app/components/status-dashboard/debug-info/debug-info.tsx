import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { IconButton, Tooltip } from '@mui/material';
import { useCallback, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { selectServiceWorker } from '../../../redux/service-worker/serviceWorker.slice';
import { useSelectStatusLogsByService } from '../../../redux/status-log/statusLog.api';

const StyledDebugInfo = styled.div`
    .title svg {
        vertical-align: bottom;
        margin: -2px -3px -2px 4px;
        color: #0c0;
    }

    pre {
        button {
            position: absolute;
            display: block;
            top: 30px;
            right: 10px;

            svg {
                background-color: #eee;
            }
        }
    }
`;

export const DebugInfo = () => {
    const tooltipContainerRef = useRef<HTMLDivElement | null>(null);
    const [tooltipOpened, setTooltipOpened] = useState(false);

    const secureContext = window.isSecureContext;
    const {
        isControlling,
        status: workerStatus,
        serverPeerStatus,
        boxAddresses,
        versions: { app, root, gateway },
    } = useSelector(selectServiceWorker);
    const { data: boxStatusLogs } = useSelectStatusLogsByService();

    const debugInfo = JSON.stringify(
        {
            workerStatus: {
                serverPeerStatus,
                boxAddresses,
                status: workerStatus,
                isControlling,
                secureContext,
            },
            boxStatusLogs: Object.fromEntries(
                Object.entries(boxStatusLogs).map(([boxId, logs]) => [
                    boxId,
                    {
                        status: logs.slice(-1)[0]?.status ?? '',
                        logs,
                    },
                ])
            ),
            versions: {
                app,
                root,
                gateway,
            },
        },
        undefined,
        2
    );

    const handleCopyClick = useCallback(() => {
        navigator.clipboard.writeText(debugInfo);
        setTooltipOpened(true);
        setTimeout(() => {
            setTooltipOpened(false);
        }, 2000);
    }, [debugInfo]);

    return (
        <StyledDebugInfo className="debug-info" ref={tooltipContainerRef}>
            <pre>
                <Tooltip
                    title={
                        <span className="title">
                            Copied <DoneAllIcon />
                        </span>
                    }
                    open={tooltipOpened}
                    PopperProps={{
                        container: tooltipContainerRef.current,
                    }}
                >
                    <IconButton onClick={handleCopyClick}>
                        <ContentCopyIcon />
                    </IconButton>
                </Tooltip>
                <code>{debugInfo}</code>
            </pre>
        </StyledDebugInfo>
    );
};

export default DebugInfo;
