import { Test, TestingModule } from '@nestjs/testing';
import { ManifestsManager } from './manifests.manager';

describe('ManifestsManager', () => {
    let manager: ManifestsManager;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ManifestsManager],
        }).compile();

        manager = module.get<ManifestsManager>(ManifestsManager);
    });

    it('should be defined', () => {
        expect(manager).toBeDefined();
    });
});
