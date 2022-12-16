import { ServerPeerStatus } from 'packages/gateway-client/src/worker-messaging';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import {
    selectRelayAddresses,
    selectWorkerStatus,
} from '../../../redux/service-worker/serviceWorker.slice';

const StyledWorkerStatus = styled.div`
    padding: 10px;

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

    .properties {
        display: flex;
        flex-wrap: wrap;
        margin: 0;

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

        .box-address {
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

    .box-address {
        display: block;
        min-height: calc(100% - 170px);
    }

    .property.box-addresses {
        display: none;
    }

    .service-status-link {
        display: initial;
        color: #08f;

        &:hover {
            text-decoration: underline;
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

export const WorkerStatus = () => {
    const {
        isControlling,
        status: workerStatus,
        serverPeerStatus,
    } = useSelector(selectWorkerStatus);
    const boxAddresses = useSelector(selectRelayAddresses);
    const secureContext = window.isSecureContext;

    return (
        <StyledWorkerStatus className="worker-status">
            <dl className="properties">
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

                <StatusProperty
                    name="server peer"
                    value={serverPeerStatus ?? 'PENDING'}
                    color={
                        serverPeerStatus === ServerPeerStatus.CONNECTED
                            ? 'online'
                            : serverPeerStatus === ServerPeerStatus.OFFLINE
                            ? 'offline'
                            : 'connecting'
                    }
                />

                <StatusProperty
                    className="box-addresses"
                    name="box-addresses"
                    value={boxAddresses.length.toString()}
                />
            </dl>

            <div className="box-address">
                <h3>Box Addresses ({boxAddresses.length})</h3>
                <pre>
                    <code>{JSON.stringify(boxAddresses, undefined, 2)}</code>
                </pre>
            </div>
        </StyledWorkerStatus>
    );
};

export default WorkerStatus;
