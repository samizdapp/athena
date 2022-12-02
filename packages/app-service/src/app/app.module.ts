import { Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { ManifestsModule } from '../manifests/manifests.module';
import { SupervisorModule } from '../supervisor/supervisor.module';

@Global()
@Module({
    imports: [ManifestsModule, SupervisorModule],
    providers: [
        {
            provide: APP_PIPE,
            useClass: ValidationPipe,
        },
    ],
})
export class AppModule {}
