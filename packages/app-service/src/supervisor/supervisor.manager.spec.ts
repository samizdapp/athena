import { Test, TestingModule } from '@nestjs/testing';
import { SupervisorManager } from './supervisor.manager';

describe('SupervisorManager', () => {
    let manager: SupervisorManager;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [SupervisorManager],
        }).compile();

        manager = module.get<SupervisorManager>(SupervisorManager);
    });

    it('should be defined', () => {
        expect(manager).toBeDefined();
    });
});
