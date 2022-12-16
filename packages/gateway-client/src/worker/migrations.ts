import localforage from 'localforage';

import { logger } from './logging';

const log = logger.getLogger('worker/migrations');

type Migration = () => Promise<void>;

const migrations = new Map<string, Migration>();

const registerMigration = (id: string, migration: Migration) => {
    migrations.set(id, migration);
};

const migrationState = new Set<string>();

const loadCache = async () => {
    const cached = await localforage.getItem<string>('migration:state');
    if (cached) {
        JSON.parse(cached).forEach((id: string) => migrationState.add(id));
    }
};

const dumpCache = async () => {
    await localforage.setItem(
        'migration:state',
        JSON.stringify(Array.from(migrationState))
    );
};

export const runMigrations = async () => {
    // load migration data
    await loadCache();

    log.info('Running migrations...');

    // loop migrations
    for (const [id, migration] of migrations.entries()) {
        // if this migration has already been executed
        if (migrationState.has(id)) {
            log.trace('Skipping already run migration: ', id);
            // skip it
            continue;
        }

        // else, this migration has not yet been executed, so execute it
        try {
            log.info('Running migration: ', id);
            await migration();
        } catch (e) {
            log.error(
                `Migration ${id} has failed (it will be re-run on next worker execution): `,
                e
            );
            continue;
        }

        // if the migration was successful, add it to the cache
        migrationState.add(id);
    }

    log.info('Finished running migrations.');

    // save migration data
    await dumpCache();
};

// Migrate from libp2p.bootstrap to new bootstrap-list
registerMigration('0f8edbd5-6aa0-492e-9c3a-b419752dfdb1', async () => {
    // check for libp2p.bootstrap key
    const oldBootstrap = await localforage.getItem<string[]>(
        'libp2p.bootstrap'
    );
    // if we didn't find it
    if (!oldBootstrap) {
        // no need to run the migration
        return;
    } // else, we need to migrate it

    // attempt to get the new bootstrap list,
    // or create a new one if it doesn't exist
    const newBootstrap =
        (await localforage.getItem<string>('p2p:bootstrap-list')) ?? '[]';
    const newBootstrapList = JSON.parse(newBootstrap) as Record<
        string,
        unknown
    >[];
    // append the old bootstrap value to the new bootstrap list
    newBootstrapList.push({
        address: oldBootstrap,
    });
    // save the new bootstrap list
    await localforage.setItem(
        'p2p:bootstrap-list',
        JSON.stringify(newBootstrapList)
    );

    // we won't remove the old bootstrap key
    // in case it is needed after the migration
});

// Clear obsolete pwa-static-cache
registerMigration('b0e1c2c0-1b0f-4b1f-9c1f-1c1f1c1f1c1f', async () => {
    // search for old key
    const oldKey = 'pwa-static-cache';
    const foundCache = await caches.has(oldKey);

    // if it wasn't found
    if (!foundCache) {
        // nothing more to do
        return;
    }

    // else, delete the cache
    await caches.delete(oldKey);
});
