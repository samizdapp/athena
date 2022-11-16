import { logger, getLoggers, setLevel, resetLevel } from '.';

describe('logging should', () => {
    afterEach(() => {
        Object.entries(logger.getLoggers()).forEach(([name]) => {
            delete logger.getLoggers()[name];
        });
    });

    it('get all loggers', () => {
        logger.getLogger('test');

        expect(getLoggers()).toHaveLength(2);
    });

    it('get loggers by name', () => {
        logger.getLogger('test');

        expect(getLoggers('foo')).toHaveLength(0);
        expect(getLoggers('test')).toHaveLength(1);
    });

    it('get loggers by name with wildcard', () => {
        logger.getLogger('test');

        expect(getLoggers('foo*')).toHaveLength(0);
        expect(getLoggers('tes*')).toHaveLength(1);
    });

    it('set level', () => {
        setLevel('trace');
        expect(logger.getLevel()).toBe(0);
        setLevel('debug');
        expect(logger.getLevel()).toBe(1);
        setLevel('info');
        expect(logger.getLevel()).toBe(2);
        setLevel('warn');
        expect(logger.getLevel()).toBe(3);
        setLevel('error');
        expect(logger.getLevel()).toBe(4);
        setLevel('silent');
        expect(logger.getLevel()).toBe(5);
    });

    it('set level by name', () => {
        logger.getLogger('foo');

        setLevel('foo', 'trace');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(0);
        setLevel('foo', 'debug');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(1);
        setLevel('foo', 'info');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(2);
        setLevel('foo', 'warn');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(3);
        setLevel('foo', 'error');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(4);
        setLevel('foo', 'silent');
        expect(getLoggers('foo')[0][1].getLevel()).toBe(5);
    });

    it('reset level', () => {
        resetLevel();
        expect(logger.getLevel()).toBe(2);
    });
});
