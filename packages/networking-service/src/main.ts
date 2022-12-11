// import manager from './yggdrasil/manager'
import upnp from './upnp';
import app from './app';
import './libp2p/manager';
import manager from './yggdrasil/manager';

console.log('starting yggdrasil manager');
manager.start();
app.start();

async function cleanup() {
    console.log('cleaning up');
    await upnp.stop();
    console.log('done cleaning up');
}

//https://stackoverflow.com/a/14032965
async function exitHandler(
    options: { exit?: boolean; cleanup?: boolean },
    exitCode: number
) {
    if (options.cleanup) await cleanup();
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));
