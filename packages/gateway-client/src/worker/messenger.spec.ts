import { Message, WorkerMessageType } from '../worker-messaging';
import messenger from './messenger';

let mockClient = {} as WindowClient;

jest.mock('./client', () => ({
    getBootstrapClient: jest.fn(() => Promise.resolve(mockClient)),
}));

describe('messenger should', () => {
    beforeEach(() => {
        mockClient = {
            postMessage: jest.fn(),
        } as unknown as WindowClient;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('send a message', async () => {
        const msg = { type: 'test' };
        await messenger.postMessage(msg as Message<WorkerMessageType>);
        expect(mockClient.postMessage).toHaveBeenCalledWith(msg);
    });
});
