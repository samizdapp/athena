import 'whatwg-fetch';

import { renderWithProviders } from '../../redux/testing';
import Status from './status';

describe('Status', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(<Status />);
        expect(baseElement).toBeTruthy();
    });
});
