import prompt from 'prompt';
import yargs from 'yargs';

import { dialBox, DialBoxArgs } from './app/commands/dial-box';
import { pingAddress, PingAddressArgs } from './app/commands/ping-address';
import EventEmitter from 'node:events';

let abortController: AbortController | null = null;
let recalledValue = -1;
let blockPrompt = false;

prompt.message = '';
prompt.delimiter = '';
const PROMPT = '> ';

const prompter = new EventEmitter();
const history: string[] = [];

const resumeStdin = () => {
    // without this, we would only get streams once enter is pressed
    process.stdin.setRawMode(true);

    // resume stdin in the parent process (node app won't quit all by itself
    // unless an error or process.exit() happens)
    process.stdin.resume();

    // i don't want binary, do you?
    process.stdin.setEncoding('utf8');
};

const listenForPrompt = async () => {
    const value = (await prompt.get([PROMPT]))[PROMPT] as string;
    resumeStdin();
    if (blockPrompt) {
        blockPrompt = false;
        return;
    }
    prompter.emit('prompt', value);
};

const getPrompt = async () => {
    return new Promise<string>(resolve => {
        prompter.once('prompt', value => {
            history.unshift(value);
            resolve(value);
        });
    });
};

const run = async () => {
    abortController = new AbortController();

    listenForPrompt();
    const args = await getPrompt();

    console.log('');

    await yargs(args.split(' '))
        .scriptName('')
        .command<PingAddressArgs>(
            'ping-address <multiaddr>',
            'Ping a multiaddr',
            yargs => {
                yargs.positional('multiaddr', {
                    describe: 'The address of the node to ping',
                    type: 'string',
                });
                return yargs;
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            argv => pingAddress(argv, abortController!.signal)
        )
        .command<DialBoxArgs>(
            'dial-box <multiaddr> [protocol]',
            'Dial a box',
            yargs => {
                yargs.positional('multiaddr', {
                    describe: 'The address of the box to dial',
                    type: 'string',
                });
                yargs.positional('protocol', {
                    describe:
                        'The protocol to use (default: /samizdapp-heartbeat',
                    type: 'string',
                    default: '/samizdapp-heartbeat',
                });
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            argv => dialBox(argv, abortController!.signal)
        )
        .strictCommands()
        .help()
        .fail(async (msg, error) => {
            console.error(msg);
            if (error) {
                console.error(error);
            }
            console.log('');
            yargs.showHelp();
        })
        .exitProcess(false).argv;

    console.log('');

    abortController = null;

    run();
};

const start = () => {
    //
    // Start the prompt
    //
    prompt.start();

    console.log('** Athena CLI: **');

    run();
};

resumeStdin();

// on any data into stdin
process.stdin.on('data', key => {
    const str = key.toString();
    const esc = str.length === 1 && str.charAt(0) === '\x1B';
    const returnKey = str.length === 1 && str.charAt(0) === '\r';
    enum Command {
        UP = 'A',
        DOWN = 'B',
        RIGHT = 'C',
        LEFT = 'D',
    }
    const command = str.length === 3 ? str.charAt(2) : null;

    //console.log({ esc, command, returnKey });

    if (esc && abortController) {
        console.log('Aborting...');
        abortController.abort();
    }

    if (command === Command.UP) {
        recalledValue++;
        process.stdin.write('\n');
        process.stdin.write(history[recalledValue] ?? '');
    }

    if (returnKey && recalledValue >= 0) {
        prompter.emit('prompt', history[recalledValue] ?? '');
        recalledValue = -1;
        blockPrompt = true;
    }
});

start();
