import { Module } from '@nestjs/common';
import { ManifestsManager } from './manifests.manager';
import { ManifestsController } from './manifests.controller';

@Module({
    controllers: [ManifestsController],
    providers: [ManifestsManager],
})
export class ManifestsModule {}
