// test pleromaTimelineHandler
import { getWindowClient } from '../client';
import { pleromaTimelineHandler } from './pleroma-timeline-handler';

let mockClient = {} as WindowClient;

jest.mock('../client', () => ({
    getWindowClient: jest.fn(() => Promise.resolve(mockClient)),
}));

describe('pleromaTimelineHandler() should', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mockClient = {
            navigate: jest.fn(),
        } as unknown as WindowClient;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Navigate to /timeline/fediverse if on /timeline/local', async () => {
        const request = {
            url: 'https://example.com/api/v1/timelines/public?local=true',
        };
        const respondWith = jest.fn();
        pleromaTimelineHandler(request as Request, respondWith);
        expect(respondWith).toHaveBeenCalledWith(fetch(request as Request));
        await getWindowClient(() => true);
        expect(mockClient.navigate).toHaveBeenCalledWith('/timeline/fediverse');
    });
});
