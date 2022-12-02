import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SupervisorManager } from './supervisor.manager';

@Global()
@Module({
    imports: [ScheduleModule.forRoot()],
    providers: [SupervisorManager],
})
export class SupervisorModule {}
