import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import { selectRelayAddresses } from '../../redux/service-worker/serviceWorker.slice';
import Properties from '../status-info/properties';
import WorkerProperties from '../status-info/worker-properties';

const StyledWorker = styled.div`
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
        text-align: center;
        margin: 0 0 5px 0;
        font-size: 1.3em;
        line-height: 1em;
    }

    .status {
        overflow: auto;
        overflow-x: hidden;
        padding-right: 5px;
        width: 100%;
        height: calc(100% - 20px);

        .properties {
            overflow: auto;
            height: calc(100% - 30px);
            .property {
                margin: 0;
            }
        }

        .service-status-link {
            color: #08f;

            &:hover {
                text-decoration: underline;
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
export interface WorkerProps {}

export function Worker() {
    const boxAddresses = useSelector(selectRelayAddresses);

    return (
        <StyledWorker>
            <h1>Worker</h1>

            <div className="status">
                <Properties>
                    <WorkerProperties />

                    <StatusProperty
                        className="box-addresses"
                        name="box-addresses"
                        value={boxAddresses.length.toString()}
                    />
                </Properties>

                <Link className="service-status-link" to="/smz/pwa/status">
                    See full status
                </Link>
            </div>
        </StyledWorker>
    );
}

export default Worker;
