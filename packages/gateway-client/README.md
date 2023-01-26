# Gateway Client

A React app plus service worker app. This package
[uses libp2p libraries](../../#using-libp2p-libraries).

The [gateway-client](packages/gateway-client) is a web app that installs a PWA
on both mobile and desktop. The PWA intercepts all network traffic from
whichever SamizdApp app is currently open and forwards it to the
`networking-service`.

## Running Locally

To run the gateway client locally, execute `npm start` (alias for
`npm start gateway-client`) with the following environment variables set:

```
NX_LOCAL = true
NX_CADDY_ROOT = "http://joshua-samizdapp.local"
```

You can optionally set the variables `NX_BUILD_NUMBER`, `NX_BUILD_COMMIT`, and
`NX_BUILD_BRANCH` to test out the UI features for reporting this info.

## DevTools

The worker app provides dev tools via the global variable `SamizdAppDevTools`:

-   `logging` - Manage the log level of the worker:
    -   `getLoggers(name:? string)` - Return loggers matching the given name (a
        regex string), or all loggers if no name is given.
    -   `resetLevel(name?: string)` - Reset the log level of the given logger (a
        regex string), or all loggers if no name is given.
    -   `setLevel(levelOrName: string, level?: string)` - Set the log level of
        the given logger (a regex string) or all loggers (if no name is given)
        to the given level. Any log level changes are persisted across page
        refreshes and worker restarts.
-   `status` - Return the current status of the worker.
-   `localforage` - Access to the worker's persistent storage.
-   `version` - The current version of the worker.
-   `p2pClient` - The client instance used by the worker to manage the worker
    libp2p node. The full client API is available, some common operations are:
    -   `bootstrapList.addressList` - The list of available addresses to the box.
    -   `node.dial(address)` - Use libp2p to dial the given address.
    -   `node.dialProtocol(address, protocol)` - Use libp2p to dial the given
        address and protocol.
-   `addressBook` - The address list that libp2p has for the node (should be
    but isn't necessarily the same as the bootstrap address list).

## Worker Architecture

The worker app uses an unusual architecture. The purpose of the worker is to
provide a connection to the box where a direct https connection wouldn't
otherwise be possible. However, a direct https connection is required to
install or update any service worker. To account for this, the worker app is
split into two parts: a _root worker_ (`worker/service-worker.ts`) and a child
_app worker_ (`worker/app.ts`).

The _root worker_ is a standard service worker that is updated on the client
with the usual restrictions for service workers. (Only when there is a direct
https connection to the box). The _app worker_ is loaded by the root worker,
and is able to update itself over its own libp2p connection.

The scope of the _root worker_ is solely focused on loading the app worker and
providing its service worker context to the app worker. All of the worker app
functionality is provided by the _app worker_, allowing the worker app to be
updated at all times.

### Worker Update Cycle

The _root worker_ is updated according to standard service worker update logic:
on a navigation event, an attempt is made to download the latest worker via a
direct https connection to the box. If the successfully downloaded worker is
different, it is installed and will be activated on the next worker restart.

The _app worker_ follows similar logic, with some extra functionality. On a
navigation event, an attempt is made to download the latest worker via whatever
connection to the box is available. If the successfully downloaded worker is
different, an _update_ is queued and will be installed and activated on the
next worker restart. If the worker is not able to download the latest worker,
it will assume that there is a bug in the current worker affecting connectivity
and will queue a _rollback_. Rollbacks act like updates, they take effect on
the next worker restart. Rollbacks can be cancelled by a subsequent successful
update. There is logic that prevents multiple automatic rollbacks (to account
for the possibility of a bad connection) and selects a previously working
version to roll back to.

The worker will report its version and update status to the `gateway-client`
app and is able to be manually updated or rolled back via the app as well.

### Restrictions on Modifying the Root Worker

Because the _app worker_ is widely available for updates, modifying the app
worker can be approached the same as any other app.

However, some users will not be able to update the _root worker_ unless they
completely uninstall and reinstall the client. It should be assumed that any
modifications made to the root worker will not reach some clients for up to 6
months.

This means a lot of thought should be put into making sure any root worker
modifications are:

-   Necessary - The root worker update lifecycle is complicated, so updates
    should be made as infrequently as possible.
-   Minimal - In order to maximize code quality and minimize
    complications from updates, the root worker codebase should be kept as
    lightweight as possible. This means no runtime imports (of either libraries
    or dependencies).
-   Backwards compatible - Since not all clients will receive the update, any
    changes must work with older versions of the root worker.
-   Safe - If a bug is introduced into the root worker, the fix for that bug
    will not reach all clients; any bugs introduced will remain in the wild.
    Extra care should be taken to ensure that no risky changes are made to the
    root worker.

To aid in the fulfillment of these requirements, the root worker is versioned
using a [semver](https://semver.org/) version number that is hardcoded into the
root worker. Any PRs that affect the `worker/service-worker.ts` file must
include an appropriate version bump. A major version change (indicating a
backwards-incompatible change) will require all users to reinstall their
clients.
