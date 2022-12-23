import { Controller, Get } from '@nestjs/common';
import node from '../../libp2p/node';
import upnp from '../../upnp';

@Controller('info')
export class InfoController {
    @Get('upnp')
    async findUpnp() {
        return {
            id: 'upnp',
            info: await upnp.info(),
        };
    }

    @Get('p2p')
    async findP2p() {
        return {
            id: 'p2p',
            info: {
                localMultiaddr: await node.getLocalMultiaddr(),
                peerId: await node.getSelfPeerString(),
                publicMultiaddr: await node.getPublicMultiaddr(),
            },
        };
    }
}
