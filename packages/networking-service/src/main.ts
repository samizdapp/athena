import { Debug } from './logging';
import './cleanup';
import './app';
import './libp2p';
import './yggdrasil';

const log = new Debug('main');
log.info('done loading');
