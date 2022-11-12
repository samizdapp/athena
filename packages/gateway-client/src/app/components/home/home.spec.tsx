import { MemoryRouter } from 'react-router-dom';
import 'whatwg-fetch';

import { renderWithProviders } from '../../redux/testing';
import Home from './home';

jest.mock('../../support');

describe('Home', () => {
    const renderWithRouter = (children: React.ReactNode) =>
        renderWithProviders(<MemoryRouter>{children}</MemoryRouter>);

    it('should render successfully', () => {
        const { baseElement } = renderWithRouter(<Home />);
        expect(baseElement).toBeTruthy();
    });
});
