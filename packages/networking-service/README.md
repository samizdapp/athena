# Networking Service

A NodeJS app with a bespoke singleton architecture that includes a NestJS app.
This package [uses libp2p libraries](../../README.md#using-libp2p-libraries).

The `networking-service` handles several functions related to inter-service
communication:

-   Proxy that receives network traffic from the `gateway-client` and forwards
    it to the appropriate destination.
-   Communication over the Yggdrasil network via the `yggdrasil` process. Any
    requests it receives for a `.yg` domain will be resolved via the Yggdrasil
    network.
-   Maintenance of UPnP ports on the local network so that the proxy and
    Yggdrasil can be reached over the internet.

## Running Locally

To run the networking service locally, execute `npm start networking-service`
with the following environment variables set:

```
NX_LOCAL = true
NX_CADDY_ROOT = "http://joshua-samizdapp.local"
HOSTSFILE = ./etc-hosts
YGGDRASIL_CONFIG = ./yggdrasil.conf
LIBP2P_BOOTSTRAP_FILE = ./libp2p.bootstrap
LIBP2P_ID_FILE = ./libp2p.id
YGGDRASIL_LOCAL_ALIAS = pleroma.149d95d8bf9e44dfa99bfb40ca8755cff38d6d670718292d86382f0769a7bb6.e.yg
FETCH_LOCALHOST_IP = 192.168.1.7
NODE_TLS_REJECT_UNAUTHORIZED = 0
```

Where:

-   `HOSTSFILE`, `YGGDRASIL_CONFIG`, `LIBP2P_BOOTSTRAP_FILE`, and
    `LIBP2P_ID_FILE` are all files that exist and are accessible.
-   `YGGDRASIL_LOCAL_ALIAS` is the alias of the Yggdrasil node on your box.
-   `FETCH_LOCALHOST_IP` is the IP address of your box.

**Note:** When running locally, communication with the Yggdrasil process on the
box will not be possible.
