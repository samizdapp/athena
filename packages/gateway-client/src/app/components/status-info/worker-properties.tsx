import { ServerPeerStatus } from 'packages/gateway-client/src/worker-messaging';
import { useSelector } from 'react-redux';
import { selectWorkerStatus } from '../../redux/service-worker/serviceWorker.slice';
import StatusProperty from './property';

export const WorkerProperties = () => {
    const secureContext = window.isSecureContext;
    const {
        isControlling,
        status: workerStatus,
        serverPeerStatus,
    } = useSelector(selectWorkerStatus);

    return (
        <>
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
        </>
    );
};

export default WorkerProperties;
