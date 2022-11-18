import { passThroughHandler } from './pass-through-handler';

describe('passThroughHandler() should', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        (global.fetch as jest.Mock).mockClear();
    });

    it('Pass through the request', async () => {
        const request = { url: 'https://example.com' };
        const respondWith = jest.fn();
        passThroughHandler(request as Request, respondWith);
        expect(respondWith).toHaveBeenCalledWith(fetch(request as Request));
    });
});
