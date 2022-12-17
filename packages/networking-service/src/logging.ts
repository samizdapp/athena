/* eslint-disable @typescript-eslint/no-explicit-any */
import debug from 'debug';
import { environment } from './environment';

enum LogLevels {
    TRACE = 'TRACE',
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    SILENT = 'SILENT',
}

const LOG_LEVELS: string[] = [
    LogLevels.TRACE,
    LogLevels.DEBUG,
    LogLevels.INFO,
    LogLevels.WARN,
    LogLevels.ERROR,
    LogLevels.SILENT,
];

const NAMESPACES: string[] = [];
const initPromise = new Promise<void>(resolve => {
    setImmediate(() => {
        init();
        resolve();
    });
});

export class Debug {
    private _trace: debug.Debugger;
    private _debug: debug.Debugger;
    private _info: debug.Debugger;
    private _warn: debug.Debugger;
    private _error: debug.Debugger;

    constructor(namespace: string) {
        NAMESPACES.push(namespace);
        this._trace = debug(namespace + ':' + LogLevels.TRACE);
        this._debug = debug(namespace + ':' + LogLevels.DEBUG);
        this._info = debug(namespace + ':' + LogLevels.INFO);
        this._warn = debug(namespace + ':' + LogLevels.WARN);
        this._error = debug(namespace + ':' + LogLevels.ERROR);
    }

    public async trace(fmt: string, ...args: any[]): Promise<void> {
        await initPromise;
        this._trace(fmt, ...args);
    }

    public async debug(fmt: string, ...args: any[]): Promise<void> {
        await initPromise;
        this._debug(fmt, ...args);
    }

    public async info(fmt: string, ...args: any[]): Promise<void> {
        await initPromise;
        this._info(fmt, ...args);
    }

    public async warn(fmt: string, ...args: any[]): Promise<void> {
        await initPromise;
        this._warn(fmt, ...args);
    }

    public async error(fmt: string, ...args: any[]): Promise<void> {
        await initPromise;
        this._error(fmt, ...args);
    }
}

function init() {
    const envLogLevels =
        process.env.DEBUG || `*:${environment.default_log_level}`;
    const config = envLogLevels.split(',').reduce((acc, cur) => {
        const [namespace, level] = cur.split(':');
        acc[namespace] = level;
        return acc;
    }, {} as { [key: string]: string });
    let toEnable = '';
    for (const namespace of NAMESPACES) {
        if (config[namespace] === undefined) {
            config[namespace] = config['*'] || LogLevels.INFO;
        }
        const initLevel = config[namespace];
        let i = LOG_LEVELS.indexOf(initLevel);
        if (i === -1) {
            i = LOG_LEVELS.indexOf(LogLevels.INFO);
        }
        while (i < LOG_LEVELS.length) {
            toEnable += `,${namespace}:${LOG_LEVELS[i]}`;
            // console.log('enable log level', toEnable);
            debug.enable(toEnable);
            i++;
        }
    }
    // console.log(toEnable);
}

const log = new Debug('logger');

log.trace('trace');
log.debug('debug');
log.info('info');
log.warn('warn');
log.error('error');
