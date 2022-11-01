import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MuiDrawer from '@mui/material/Drawer';
import * as React from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

import { ServerPeerStatus } from '../../../service-worker';
import {
    selectRelayAddresses,
    selectWorkerStatus,
} from '../../redux/service-worker/serviceWorker.slice';

const StyledDrawer = styled(MuiDrawer)`
    background: #fafafa;
    border-radius: 10px;
    padding: 10px;
    position: absolute;
    transition: all 0.3s ease;
    bottom: 20px;
    right: 20px;
    width: calc(100% - 40px);
    height: 170px;
    max-width: 600px;

    .MuiDrawer-paper {
        background: none;
        border: 0;
        overflow: hidden;
        position: static;
        width: 100%;
        height: 100%;
    }

    .icon {
        position: absolute;
        top: 5px;
        right: 5px;
    }

    h1 {
        font-size: 1.5em;
        line-height: 1.5em;
        margin: 0 5px 10px;
        margin-top: 0;
        text-align: center;
    }

    .status {
        overflow: auto;
        overflow-x: hidden;
        padding-right: 5px;

        .properties {
            display: flex;
            flex-wrap: wrap;

            .property {
                margin-bottom: 10px;
            }

            dl {
                flex: 1;
                margin: 0;
                min-width: 280px;
            }

            dt {
                display: inline-block;
                font-weight: bold;
                text-transform: capitalize;
                width: 125px;
            }

            dd {
                display: inline-block;
                margin: 0;
                width: 150px;
            }

            .badge {
                border-radius: 1em;
                display: inline-block;
                margin-left: 0.5em;
                width: 0.5em;
                height: 0.5em;

                &.connecting {
                    background-color: #ffd000;
                }

                &.online {
                    background-color: #00dd00;
                }

                &.offline {
                    background-color: #cc0000;
                }
            }
        }

        .relay {
            display: none;

            pre {
                background: #ddd;
                padding: 10px;
                overflow: auto;
            }
        }

        .service-status-link {
            display: none;
        }
    }

    &.open {
        height: calc(100% - 40px);
        max-height: 500px;
        max-width: 800px;

        .status {
            min-height: calc(100% - 50px);

            .relay {
                display: block;
                min-height: calc(100% - 170px);
            }

            .property.relays {
                display: none;
            }

            .service-status-link {
                display: initial;
                color: #08f;

                &:hover {
                    text-decoration: underline;
                }
            }
        }
    }
`;

interface StatusPropertyProps {
    className?: string;
    name: string;
    value: string;
    color?: 'online' | 'offline' | 'connecting' | 'none';
}

const StatusProperty = ({
    className = '',
    name,
    value,
    color = 'none',
}: StatusPropertyProps) => {
    return (
        <div className={'property ' + className}>
            <dt>{name}: </dt>
            <dd>
                {value}
                <span className={'badge ' + color}></span>
            </dd>
        </div>
    );
};

/* eslint-disable-next-line */
export interface StatusProps {}

export function Status() {
    const {
        isControlling,
        status: workerStatus,
        serverPeerStatus,
    } = useSelector(selectWorkerStatus);
    const serverRelays = useSelector(selectRelayAddresses);
    const secureContext = window.isSecureContext;

    const [open, setOpen] = React.useState(false);

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    return (
        <StyledDrawer
            variant="permanent"
            open={open}
            className={open ? 'open' : 'closed'}
        >
            <div className="icon">
                {open ? (
                    <ExpandMoreIcon onClick={handleDrawerClose} />
                ) : (
                    <ExpandLessIcon onClick={handleDrawerOpen} />
                )}
            </div>

            <h1>Worker</h1>

            <div className="status">
                <div className="properties">
                    <dl className="service">
                        <StatusProperty
                            name="status"
                            value={workerStatus ?? 'pending'}
                            color={
                                workerStatus === 'activated'
                                    ? 'online'
                                    : workerStatus === 'redundant'
                                    ? 'offline'
                                    : 'connecting'
                            }
                        />

                        <StatusProperty
                            name="controlling"
                            value={isControlling ? 'yes' : 'no'}
                            color={isControlling ? 'online' : 'connecting'}
                        />

                        <StatusProperty
                            name="secure context"
                            value={secureContext ? 'yes' : 'no'}
                            color={secureContext ? 'online' : 'offline'}
                        />
                    </dl>

                    <dl className="worker">
                        <StatusProperty
                            name="server peer"
                            value={serverPeerStatus ?? 'PENDING'}
                            color={
                                serverPeerStatus === ServerPeerStatus.CONNECTED
                                    ? 'online'
                                    : serverPeerStatus ===
                                      ServerPeerStatus.OFFLINE
                                    ? 'offline'
                                    : 'connecting'
                            }
                        />

                        <StatusProperty
                            className="relays"
                            name="relays"
                            value={serverRelays.length.toString()}
                        />
                    </dl>
                </div>

                <div className="relay">
                    <h3>Relays ({serverRelays.length})</h3>
                    <pre>
                        <code>
                            {JSON.stringify(serverRelays, undefined, 2)}
                        </code>
                    </pre>
                </div>

                <Link className="service-status-link" to="/smz/pwa/status">
                    SamizdApp Status
                </Link>
            </div>
        </StyledDrawer>
    );
}

export default Status;
