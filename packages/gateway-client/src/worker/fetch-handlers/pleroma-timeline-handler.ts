import { getWindowClient } from '../client';
import { Handler } from './fetch-handlers';

export const pleromaTimelineHandler: Handler = request => {
    // handle requests to the pleroma timeline
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === '/api/v1/timelines/public' && searchParams.get('local')) {
        getWindowClient(
            it => new URL(it.url).pathname === '/timeline/local'
        ).then(atPleromaPage => {
            if (atPleromaPage) {
                atPleromaPage.navigate('/timeline/fediverse');
            }
        });
    }

    // always allow request to continue regardless
};

export default pleromaTimelineHandler;
