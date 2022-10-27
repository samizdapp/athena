import { render } from '@testing-library/react';

import Status from './status';

describe('Status', () => {
    it('should render successfully', () => {
        const { baseElement } = render(<Status />);
        expect(baseElement).toBeTruthy();
    });
});
