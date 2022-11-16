import localforage from 'localforage';
import logger, { LogLevelDesc, levels, Logger } from 'loglevel';

const DEFAULT_LEVEL = levels.INFO;

const loadPersistedLevel = (name: string, logger: Logger) => {
    localforage.getItem(`loglevel:${name}`).then(persisted => {
        if (persisted) {
            logger.setLevel(persisted as LogLevelDesc);
        }
    });
};

// format our logging output
const originalFactory = logger.methodFactory;
logger.methodFactory = function (methodName, logLevel, loggerName) {
    const originalMethodName = methodName;
    // don't use console.trace()
    if (originalMethodName === 'trace') {
        methodName = 'debug';
    }
    const rawMethod = originalFactory(methodName, logLevel, loggerName);

    const color = `hsl(${Math.random() * 360}, 100%, 40%)`;

    return function (...args) {
        rawMethod(
            `%c${originalMethodName.toUpperCase()} [${
                loggerName?.toString() ?? 'root'
            }]`,
            `color: ${color}`,
            ...args
        );
    };
};
// Be sure to call setLevel method in order to apply plugin
logger.setLevel(logger.getLevel());

// inherit default level from root logger
const originalGetLogger = logger.getLogger;
logger.getLogger = (name: string) => {
    const isNew = !Object.prototype.hasOwnProperty.call(
        logger.getLoggers(),
        name
    );
    const childLogger = originalGetLogger.call(logger, name);
    childLogger.setDefaultLevel(DEFAULT_LEVEL);
    if (isNew) {
        loadPersistedLevel(name, childLogger);
    }
    return childLogger;
};

// set root default level
logger.setDefaultLevel(DEFAULT_LEVEL);
// load root persisted level
loadPersistedLevel('root', logger);

export const getLoggers = (name?: string) => {
    // construct regexp from given name to match loggers with
    const regexp = new RegExp(name?.replaceAll('*', '.*') ?? '.*');
    // get all loggers
    return (
        Object.entries({ ...logger.getLoggers(), root: logger })
            // filter by name
            .filter(([name]) => regexp.test(name))
    );
};

export const resetLevel = (name?: string) =>
    getLoggers(name).forEach(([name, logger]) => {
        logger.resetLevel();
        localforage.removeItem(`loglevel:${name}`);
    });

export const setLevel = (
    levelOrName: LogLevelDesc | string,
    level?: LogLevelDesc
) => {
    const name = level ? (levelOrName as string) : undefined;
    const newLevel = level ?? (levelOrName as LogLevelDesc);
    getLoggers(name).forEach(([name, logger]) => {
        logger.setLevel(newLevel);
        localforage.setItem(`loglevel:${name}`, newLevel);
    });
};

export { logger };
