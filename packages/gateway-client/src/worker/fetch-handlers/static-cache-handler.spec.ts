import { staticCacheHandler } from './static-cache-handler';

describe('staticCacheHandler() should', () => {
    beforeEach(() => {
        global.fetch = jest.fn(() => Promise.resolve({} as Response));
        global.caches = {
            open: jest.fn(() =>
                Promise.resolve({
                    match: jest.fn(() => Promise.resolve({} as Response)),
                    put: jest.fn(),
                } as unknown as Cache)
            ),
        } as unknown as CacheStorage;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Cache static assets', async () => {
        const request = {
            url: 'https://example.com/assets/example.png',
            destination: 'image',
        };
        const respondWith = jest.fn();
        staticCacheHandler(request as Request, respondWith);
        expect(respondWith).toHaveBeenCalledWith(fetch(request as Request));
    });
});
