import { Injectable } from '@nestjs/common';
import { ManifestDto as Dto } from '@athena/shared/api';
import ObjectID from 'bson-objectid';
import { readFile, writeFile } from 'node:fs/promises';

type ManifestsDb = {
    documents: Record<Dto.Manifest['id'], Dto.Manifest>;
    indexes: {
        name: Record<Dto.Manifest['name'], Dto.Manifest['id']>;
    };
};

@Injectable()
export class ManifestsManager {
    private dbJsonFile = `${process.env.APP_MANIFESTS_VOLUME}/manifests.json`;

    private initDb() {
        return {
            documents: {},
            indexes: {
                name: {},
            },
        };
    }

    private async loadDb() {
        let json;
        try {
            json = await readFile(this.dbJsonFile, 'utf-8');
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                return this.initDb();
            }
            throw e;
        }
        return JSON.parse(json) as ManifestsDb;
    }

    private async dumpDb(db: ManifestsDb) {
        const json = JSON.stringify(db);
        return writeFile(this.dbJsonFile, json);
    }

    public async create(newManifest: Dto.Create) {
        const manifest = {
            ...newManifest,
            id: ObjectID().toHexString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // load database
        const db = await this.loadDb();

        // check unique name
        if (db.indexes.name[manifest.name]) {
            throw new Error(
                `Manifest with name: \`${manifest.name}\` already exists.`
            );
        }

        // add manifest to database
        db.documents[manifest.id] = manifest;
        db.indexes.name[manifest.name] = manifest.id;

        // save database
        await this.dumpDb(db);

        // return our manifest
        return manifest;
    }

    public async findAll() {
        const db = await this.loadDb();
        return Object.values(db.documents);
    }

    public async findOne(id: string): Promise<Dto.Manifest | null> {
        // load database
        const db = await this.loadDb();

        // check if manifest exists
        const manifest = db.documents[id];

        // return our manifest
        return manifest ?? null;
    }

    public async update(id: string, newManifest: Dto.Update) {
        // load database
        const db = await this.loadDb();

        // check if manifest exists
        const manifest = db.documents[id];
        if (!manifest) {
            return null;
        }

        // if name has changed
        if (newManifest.name && newManifest.name !== manifest.name) {
            // check unique name
            if (db.indexes.name[newManifest.name]) {
                throw new Error(
                    `Manifest with name: \`${newManifest.name}\` already exists.`
                );
            }

            // update indexes
            delete db.indexes.name[manifest.name];
            db.indexes.name[newManifest.name] = manifest.id;
        }

        // update manifest
        Object.assign(manifest, newManifest, {
            updatedAt: new Date().toISOString(),
        });

        // save database
        await this.dumpDb(db);

        // return our manifest
        return manifest;
    }

    public async remove(id: string) {
        // load database
        const db = await this.loadDb();

        // check if manifest exists
        const manifest = db.documents[id];
        if (!manifest) {
            return null;
        }

        // remove manifest from database
        delete db.documents[id];
        delete db.indexes.name[manifest.name];

        // save database
        await this.dumpDb(db);

        // return our manifest
        return manifest;
    }
}
