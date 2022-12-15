import { Controller, Get } from '@nestjs/common';
import upnp from '../../upnp';

@Controller('info')
export class InfoController {
    @Get()
    async findAll() {
        return upnp.info();
    }
}
