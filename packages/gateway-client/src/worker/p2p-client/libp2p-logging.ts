import * as libp2pLogger from '@libp2p/logger';
import { levels, LogLevelDesc, LogLevelNumbers } from 'loglevel';

import { logger } from '../logging';

const log = logger.getLogger('worker/p2p/libp2p');

// pass logger levels down to libp2p logger
const levelHandlers: Record<LogLevelNumbers, (extra?: string) => void> = {
    [levels.SILENT]: () => libp2pLogger.disable(),
    [levels.ERROR]: extra =>
        libp2pLogger.enable(
            'libp2p:circuit:error, libp2p:bootstrap:error, libp2p:upgrader:error, ' +
                extra
        ),
    [levels.WARN]: extra =>
        levelHandlers[levels.ERROR]('libp2p:websockets:error, ' + extra),
    [levels.INFO]: extra =>
        levelHandlers[levels.WARN](
            'libp2p:dialer:error, libp2p:connection-manager:trace, ' + extra
        ),
    [levels.DEBUG]: extra =>
        levelHandlers[levels.INFO](
            'libp2p:peer-store:trace, libp2p:mplex:stream:trace, libp2p:*:error, ' +
                extra
        ),
    [levels.TRACE]: extra =>
        levelHandlers[levels.DEBUG]('libp2p:*:trace, ' + extra),
};

// customize setLevel functionality
const originalLogSetLevel = log.setLevel;
log.setLevel = (level: LogLevelDesc) => {
    originalLogSetLevel.call(log, level);
    levelHandlers[log.getLevel()]();
};

export const initLibp2pLogging = () => {
    log.setLevel(log.getLevel());
};
