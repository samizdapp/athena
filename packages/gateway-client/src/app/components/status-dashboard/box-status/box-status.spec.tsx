import 'whatwg-fetch';

import { renderWithProviders } from '../../../redux/testing';
import BoxStatus from './box-status';

describe('Status', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(<BoxStatus />);
        expect(baseElement).toBeTruthy();
    });
});
