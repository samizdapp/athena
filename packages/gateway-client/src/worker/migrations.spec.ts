import { runMigrations } from './migrations';

describe('migrations', () => {
    it('should run without error', async () => {
        await runMigrations();
    });
});
