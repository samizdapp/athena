import {
    isBootstrapAppUrl,
    getBootstrapClient,
    getClient,
    getWindowClient,
} from './client';

declare const global: typeof globalThis & ServiceWorkerGlobalScope;

describe('client should', () => {
    let mockResult = [] as Client[];

    beforeEach(() => {
        mockResult = [];

        Object.defineProperty(global, 'clients', {
            configurable: true,
            value: {
                matchAll: jest.fn(() => Promise.resolve(mockResult)),
            } as unknown as Clients,
        });

        global.WindowClient = global.Client = class {
            public url =
                'http://example.com/api/v1/timelines/public?local=true';
        } as typeof Client as typeof WindowClient;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('be initialized', () => {
        expect(getBootstrapClient).toBeDefined();
        expect(getClient).toBeDefined();
        expect(getWindowClient).toBeDefined();
        expect(isBootstrapAppUrl).toBeDefined();
    });

    it('isBootstrapAppUrl should return true for bootstrap app url', () => {
        expect(
            isBootstrapAppUrl(new URL('https://example.com/smz/pwa'))
        ).toBeTruthy();
    });

    it('isBootstrapAppUrl should return false for non-bootstrap app url', () => {
        expect(isBootstrapAppUrl(new URL('https://example.com'))).toBeFalsy();
    });

    it('getBootstrapClient should return bootstrap client', async () => {
        const mockClient = new WindowClient();
        Object.defineProperty(mockClient, 'url', {
            configurable: true,
            value: 'https://example.com/smz/pwa',
        });

        mockResult = [mockClient];

        const client = await getBootstrapClient();

        expect(client).toBe(mockClient);
    });

    it('getBootstrapClient should return undefined if no bootstrap client', async () => {
        const client = await getBootstrapClient();

        expect(client).toBeUndefined();
    });

    it('getClient should return client', async () => {
        const mockClient = new WindowClient();

        mockResult = [mockClient];

        const client = await getClient(() => true);

        expect(client).toBe(mockClient);
    });

    it('getClient should return undefined if no client', async () => {
        const client = await getClient(() => true);

        expect(client).toBeUndefined();
    });

    it('getWindowClient should return window client', async () => {
        const mockClient = new WindowClient();

        mockResult = [mockClient];

        const client = await getWindowClient(() => true);

        expect(client).toBe(mockClient);
    });

    it('getWindowClient should return undefined if no window client', async () => {
        const client = await getWindowClient(() => true);

        expect(client).toBeUndefined();
    });
});
