import { staticCacheHandler } from './static-cache-handler';

describe('staticCacheHandler() should', () => {
    let cacheResponse: Response;
    let updatedResponse: Response;

    beforeEach(() => {
        cacheResponse = {} as Response;
        updatedResponse = {} as Response;
        global.fetch = jest.fn(() => Promise.resolve(updatedResponse));
        global.caches = {
            open: jest.fn(() =>
                Promise.resolve({
                    match: jest.fn(() => Promise.resolve(cacheResponse)),
                    put: jest.fn(),
                } as unknown as Cache)
            ),
        } as unknown as CacheStorage;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Return cached static asset', async () => {
        const request = {
            url: 'https://example.com/assets/example.png',
            destination: 'image',
            headers: {
                get: jest.fn(() => undefined),
            },
        };
        const respondWith = jest.fn();
        staticCacheHandler(request as unknown as Request, respondWith);
        expect(respondWith).toHaveBeenCalled();
        const [response] = respondWith.mock.calls[0];
        await expect(response).resolves.toBe(cacheResponse);
    });

    it('Skip cache if header is set', async () => {
        const request = {
            url: 'https://example.com/assets/example.png',
            destination: 'image',
            headers: {
                get: jest.fn(name =>
                    name === 'X-Smz-Worker-Cache' ? 'no-cache' : undefined
                ),
            },
        };
        const respondWith = jest.fn();
        staticCacheHandler(request as unknown as Request, respondWith);
        expect(respondWith).not.toHaveBeenCalled();
    });
});
