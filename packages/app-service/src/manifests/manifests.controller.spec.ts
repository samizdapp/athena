import { Test, TestingModule } from '@nestjs/testing';
import { ManifestsController } from './manifests.controller';
import { ManifestsManager } from './manifests.manager';

describe('ManifestsController', () => {
    let controller: ManifestsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ManifestsController],
            providers: [ManifestsManager],
        }).compile();

        controller = module.get<ManifestsController>(ManifestsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
