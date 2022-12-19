import { Debug } from './logging';
import './cleanup';
import './app';
import './libp2p';
import './yggdrasil';
import './hotspot';
import './mdns';

const log = new Debug('main');
log.info('done loading');
