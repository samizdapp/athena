import { IntersectionType, PartialType } from '@nestjs/mapped-types';
import { IsString } from 'class-validator';
import { Resource } from './resource.dto';

export class Create {
    @IsString()
    name!: string;

    @IsString()
    manifest!: string;
}

export class Update extends PartialType(Create) {}

export class Manifest extends IntersectionType(Resource, Create) {}
