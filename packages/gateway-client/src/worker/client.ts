declare const self: ServiceWorkerGlobalScope;

export const isBootstrapAppUrl = (url: URL): boolean =>
    url.pathname.startsWith('/smz/pwa');

export const getClient = async (matcher: (client: Client) => boolean) => {
    const allClients = await self.clients.matchAll();
    return allClients.find(matcher);
};

export const getWindowClient = async (
    matcher: (client: WindowClient) => boolean
) => {
    const client = (await getClient(
        it => it instanceof WindowClient && matcher(it)
    )) as WindowClient | undefined;
    return client;
};

export const getBootstrapClient = () =>
    getWindowClient(it => isBootstrapAppUrl(new URL(it.url)));
