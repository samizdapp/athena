import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import 'whatwg-fetch';

import { renderWithProviders } from '../../redux/testing';
import Status from './worker';

describe('Status', () => {
    const renderWithRouter = (children: React.ReactNode) =>
        renderWithProviders(<MemoryRouter>{children}</MemoryRouter>);

    it('should render successfully', () => {
        const { baseElement } = renderWithRouter(<Status />);
        expect(baseElement).toBeTruthy();
    });
});
