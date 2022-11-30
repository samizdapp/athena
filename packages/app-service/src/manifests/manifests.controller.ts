import { ManifestDto as Dto } from '@athena/shared/api';
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    NotFoundException,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { ManifestsManager } from './manifests.manager';

@Controller('manifests')
export class ManifestsController {
    constructor(private readonly manifestsManager: ManifestsManager) {}

    @Post()
    create(@Body() newManifest: Dto.Create) {
        return this.manifestsManager.create(newManifest);
    }

    @Get()
    findAll() {
        return this.manifestsManager.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const manifest = await this.manifestsManager.findOne(id);
        if (!manifest) {
            throw new NotFoundException(
                `Manifest with id: \`${id}\` not found.`
            );
        }
        return manifest;
    }

    @Patch(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async update(@Param('id') id: string, @Body() newManifest: Dto.Update) {
        const manifest = await this.manifestsManager.update(id, newManifest);
        if (!manifest) {
            throw new NotFoundException(
                `Manifest with id: \`${id}\` not found.`
            );
        }
        return manifest;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        const manifest = await this.manifestsManager.remove(id);
        if (!manifest) {
            throw new NotFoundException(
                `Manifest with id: \`${id}\` not found.`
            );
        }
        return { id: manifest.id };
    }
}
