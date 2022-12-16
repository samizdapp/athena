import 'whatwg-fetch';

import { renderWithProviders } from '../../redux/testing';
import StatusDashboard from './status-dashboard';

describe('Status', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(<StatusDashboard />);
        expect(baseElement).toBeTruthy();
    });
});
