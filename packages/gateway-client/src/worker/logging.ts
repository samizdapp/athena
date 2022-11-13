import logger, { LogLevelDesc, levels } from 'loglevel';

logger.setDefaultLevel(levels.INFO);

export const getLoggers = (name?: string) => {
    // construct regexp from given name to match loggers with
    const regexp = new RegExp(name?.replaceAll('*', '.*') ?? '.*');
    // get all loggers
    return (
        Object.entries(logger.getLoggers())
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
