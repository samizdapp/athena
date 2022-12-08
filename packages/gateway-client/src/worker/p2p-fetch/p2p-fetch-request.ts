import { logger } from '../logging';
import { P2pClient } from '../p2p-client';

export class P2pFetchRequest {
    private request: Request;

    constructor(
        private p2pClient: P2pClient,
        givenReqObj: Request | URL | string,
        _givenReqInit: RequestInit | undefined = {}
    ) {
        // assert that we were given a request and store it
        this.request = givenReqObj = givenReqObj as Request;
        if (typeof givenReqObj.url != 'string') {
            throw new Error(
                `Patched service worker \`fetch()\` method expects a full ` +
                    `request object, received ${givenReqObj.constructor.name}`
            );
        }
    }

    async execute() {
        // time to execute our request
        // this log line fills in for the lack of a network log in our DevTools
        const stream = await this.p2pClient.getNativeRequestStream();

        return stream.fetch(this.request);
    }
}
