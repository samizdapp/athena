import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from '@nestjs/common';
import { LogsService } from './logs.service';
import * as Dto from './dto/log.dto';

@Controller('logs')
export class LogsController {
    constructor(private readonly logsService: LogsService) {}

    @Post()
    async create(@Body() newLog: Dto.Create) {
        return { id: await this.logsService.create(newLog) };
    }

    @Get()
    findAll() {
        return this.logsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.logsService.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() newLog: Dto.Update) {
        return this.logsService.update(+id, newLog);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.logsService.remove(+id);
    }
}
