import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsEnum } from 'class-validator';

export enum Status {
    ONLINE = 'ONLINE',
    WAITING = 'WAITING',
    OFFLINE = 'OFFLINE',
}

export class Create {
    @IsString()
    service!: string;

    @IsEnum(Status)
    status!: Status;

    @IsString()
    message!: string;
}

export class Update extends PartialType(Create) {}

export class Log extends Create {
    id!: string;
    createdAt!: string;
    updatedAt!: string;
}
