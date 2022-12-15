import { Module } from '@nestjs/common';
import { InfoController } from './info.controller';

@Module({
    controllers: [InfoController],
    providers: [],
})
export class InfoModule {}
