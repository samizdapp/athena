# Athena

This project holds the custom services and apps that make up SamizdApp.

The new structure of the herakles project is currently being developed here:
https://docs.google.com/document/d/1yYs_DpihNry7s5gMlIveZMjwnDlYOWgG1kRJCNedhQM/edit#heading=h.fdp41s6w6tv0

## Install

### nvm

Run:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
```

### Anaconda

```bash
curl https://repo.anaconda.com/archive/Anaconda3-2022.10-Linux-x86_64.sh -o /tmp/anaconda.sh && bash /tmp/anaconda.sh
```

```bash
conda config --set auto_activate_base false
```

```bash
conda env create
```

### Poetry

```bash
conda activate athena
```

```bash
curl -sSL https://install.python-poetry.org | python3 - --version 1.2.0
```

### Autoenv

Installing autoenv eliminates the need to run `nvm use` and
`conda activate athena` every time you `cd` into the project.

Run:

```bash
curl -#fLo- 'https://raw.githubusercontent.com/hyperupcall/autoenv/master/scripts/install.sh' | sh
```

The above command will append a line to your `~/.bashrc` file that sources
`autoenv/activate.sh`. Add the following variables to your `~/.bashrc` file
immediately _before_ the source line:

```bash
AUTOENV_ENABLE_LEAVE=yes
AUTOENV_ENV_FILENAME=.autoenv
AUTOENV_ENV_LEAVE_FILENAME=.autoenv.leave
```

### Project

Once all above dependencies are installed, run:

```bash
nvm use
conda activate athena

npm install

poetry install
```

## Project Architecture

### Types of Packages

A `service` is a microservice that runs inside the box. Services make up the
core functionality of SamizdApp.

A `client` is an app that runs on a client device. Clients are used to connect
to the box from the client device.

The `shared-*` packages are internal libraries that are shared between other
packages.

The `tools-*` packages are internal tools used to aid development.

### Overview of Packages

The [gateway-client](packages/gateway-client) is a web app that installs a PWA
on both mobile and desktop. The PWA intercepts all network traffic from
whichever SamizdApp app is currently open and forwards it to the
`networking-service`.

The [networking-service](packages/networking-service) handles several functions
related to inter-service communication. It runs a proxy that receives network
traffic from the `gateway-client` and forwards it to the appropriate service,
`yggdrasil` domain, or external address. It also handles communication over the
Yggdrasil network by communicating with the `yggdrasil` process. Any requests
it receives for a `.yg` domain will be resolved via the Yggdrasil network.
Lastly, it maintains UPnP ports on the local network so that the proxy and
Yggdrasil can be reached over the internet.

Other services running on the box continually report their current status to
the [status-service](packages/status-service), which in turn provides an API to
access the status of services on the box. However, most services are not
currently reporting their status and more work needs to be done here.

The [app-service](packages/app-service) facilitates the installation of custom
docker compose stacks, and can probably be replaced with something like CasaOS
in the future.

Details for each [shared](packages/shared) package can be found in their
respective directories.

The Athena CLI at [tools/cli](packages/tools/cli) provides a set of utility
commands that aid development and testing.

### Nx Workspace

This repo is an Nx workspace, which you can learn more about
[here](https://nx.dev).

Use the following commands to manage and run the packages in this project:

#### Generate a Client or Service

To generate a new client, run `npm run nx -- g @nrwl/react:app new-client`.

To generate a new service, run `npm run nx -- g @nrwl/nestjs:app new-service`.

Remove the generated `src/environments/` directory. Use environment variables
to manage different values for different environments. Optionally, an app may
use an `src/environment.ts` file to provide a single place for environment
variables to be accessed from.

Create a `Dockerfile` that follows similar patterns as those of existing
packages. Remember to copy every shared library that your package uses in the
`Dockerfile`.

##### Using LibP2P Libraries

Certain libraries used for working with LibP2P are ESModules, which Nx still
has limited support for. An ESLint rule will mark any direct imports of these
libraries as errors. Instead you should import the `@athena/shared/libp2p`
wrapper for the library you wish to use.

Any _service_ (i.e. NodeJS app) importing any `@athena/shared/libp2p` library
must define separate `build-service` and `build-libp2p` targets and use them
accordingly. See the `networking-service` or `tools-cli` for examples.

#### Generate a Library

Run `npm run nx -- g @nrwl/react:lib shared/my-lib` to generate a library.

Libraries are shareable across libraries and applications. They can be imported
from `@athena/shared/my-lib`.

#### Build

Run `npm run build my-app` to build the package. The build artifacts will be
stored in the `dist/` directory. Use the `--prod` flag for a production build.

#### Test

Run `npm test my-app` to execute the unit tests via [Jest](https://jestjs.io).

Run `npm run nx -- affected:test` to execute the unit tests affected by a
change.

#### Understand Your Workspace

Run `npm run nx -- graph` to see a diagram of the dependencies of your
packages.

#### Run Locally

Most packages can be run individually via `npm start package-name`. However,
most packages have additional necessary details for running locally available
in their directory.

Running the full stack locally entails running each Athena package individually
on a local machine. However, a working box is still needed to run services that
are not a part of Athena, and functionality will be limited (namely,
communication via Yggdrasil will not function).

The following `.local.env` file can be used when running all packages locally:

```
# Global
NX_LOCAL = true
NX_CADDY_ROOT = "http://joshua-samizdapp.local"
NX_STATUS_API_ROOT = "http://localhost:3411/smz/api/status"

# Gateway Client & App Worker
NX_NETWORKING_API_ROOT = "http://localhost:3413/smz/api/networking"

# App Service
APP_MANIFESTS_VOLUME = ./
SUPERVISOR_PATH = ./packages/app-service/src/supervisor.py
APP_API_ROOT = "http://localhost:3412/smz/api/app"

# Networking Service
HOSTSFILE = ./etc-hosts
YGGDRASIL_CONFIG = ./yggdrasil.conf
LIBP2P_BOOTSTRAP_FILE = ./libp2p.bootstrap
LIBP2P_ID_FILE = ./libp2p.id
YGGDRASIL_LOCAL_ALIAS = pleroma.149d95d8bf9e44dfa99bfb40ca8755cff38d6d670718292d86382f0769a7bb6.e.yg
FETCH_LOCALHOST_IP = 192.168.1.7
NODE_TLS_REJECT_UNAUTHORIZED = 0
```

Read the instructions in each [package's directory](packages/) to run `gateway-client`,
`app-service`, `status-service`, and `networking-service` locally.
