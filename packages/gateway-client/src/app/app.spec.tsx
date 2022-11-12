import { BrowserRouter } from 'react-router-dom';
import 'whatwg-fetch';

import App from './app';
import { renderWithProviders } from './redux/testing';

jest.mock('./support');

describe('App', () => {
    it('should render successfully', () => {
        const { baseElement } = renderWithProviders(
            <BrowserRouter>
                <App />
            </BrowserRouter>
        );

        expect(baseElement).toBeTruthy();
    });
});
