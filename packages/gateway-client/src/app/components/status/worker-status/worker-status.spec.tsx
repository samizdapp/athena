import { renderWithProviders } from '../../../redux/testing';

import WorkerStatus from './worker-status';

describe('WorkerStatus', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(<WorkerStatus />);
        expect(baseElement).toBeTruthy();
    });
});
