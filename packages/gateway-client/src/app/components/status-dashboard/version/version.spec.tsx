import { renderWithProviders } from '../../../redux/testing';

import Version from './version';

describe('Version', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(<Version />);
        expect(baseElement).toBeTruthy();
    });
});
