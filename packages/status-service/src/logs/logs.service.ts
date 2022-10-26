import { LogDto as Dto } from '@athena/shared/api';
import { Injectable } from '@nestjs/common';
import ObjectID from 'bson-objectid';

@Injectable()
export class LogsService {
    private logCache: Record<string, Dto.Log[]> = {};

    constructor() {
        this.logSelfStatus('Log cache initiated.');
    }

    private async createLog(newLog: Dto.Create) {
        const log = {
            ...newLog,
            id: ObjectID().toHexString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.logCache[newLog.service] = [
            ...(this.logCache[newLog.service]?.slice(-4) ?? []),
            log,
        ];
        return log;
    }

    private async logSelfStatus(message: string) {
        return this.createLog({
            service: 'status_service',
            status: Dto.Status.ONLINE,
            message,
        });
    }

    async create(newLog: Dto.Create) {
        this.logSelfStatus('Receiving status updates.');
        const log = await this.createLog(newLog);
        return log.id;
    }

    findAll() {
        return Object.values(this.logCache).flat();
    }

    findOne(id: number) {
        return `This action returns a #${id} log`;
    }

    update(id: number, _newLog: Dto.Update) {
        return `This action updates a #${id} log`;
    }

    remove(id: number) {
        return `This action removes a #${id} log`;
    }
}
