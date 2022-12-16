import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { selectRelayAddresses } from '../../../redux/service-worker/serviceWorker.slice';
import Properties from '../../status-info/properties';

import StatusProperty from '../../status-info/property';
import WorkerProperties from '../../status-info/worker-properties';

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

export const WorkerStatus = () => {
    const boxAddresses = useSelector(selectRelayAddresses);

    return (
        <StyledWorkerStatus className="worker-status">
            <Properties>
                <WorkerProperties />

                <StatusProperty
                    className="box-addresses"
                    name="box-addresses"
                    value={boxAddresses.length.toString()}
                />
            </Properties>

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
