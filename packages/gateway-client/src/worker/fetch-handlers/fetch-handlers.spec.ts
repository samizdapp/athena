import fetchHandlers from './fetch-handlers';

describe('fetchHandlers', () => {
    it('.use() should add a handler', () => {
        const handler = () => {
            /*empty*/
        };
        fetchHandlers.use(handler);
        expect(fetchHandlers['handlers']).toContain(handler);
    });
});
