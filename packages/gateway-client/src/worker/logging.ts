import logger, { LogLevelDesc, levels } from 'loglevel';

// get level names
const levelNames = Object.keys(levels) as (keyof typeof levels)[];

logger.setDefaultLevel(levels.INFO);

// format our logging output
const originalFactory = logger.methodFactory;
logger.methodFactory = function (methodName, logLevel, loggerName) {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);

    const color = `hsl(${Math.random() * 360}, 100%, 40%)`;

    return function (...args) {
        rawMethod(
            `%c${levelNames[logLevel]} [${loggerName?.toString() ?? 'root'}]`,
            `color: ${color}`,
            ...args
        );
    };
};
// Be sure to call setLevel method in order to apply plugin
logger.setLevel(logger.getLevel());

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
    getLoggers(name).forEach(([_, logger]) => logger.resetLevel());

export const setLevel = (
    levelOrName: LogLevelDesc | string,
    level?: LogLevelDesc
) => {
    const name = level ? (levelOrName as string) : undefined;
    const newLevel = level ?? (levelOrName as LogLevelDesc);
    getLoggers(name).forEach(([_, logger]) => logger.setLevel(newLevel));
};

export { logger };
