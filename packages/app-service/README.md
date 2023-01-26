# App Service

A NestJS app.

The `app-service` facilitates the installation of custom docker compose stacks.

Once [CasaOS](https://www.casaos.io/) releases native docker compose support
(https://github.com/IceWhaleTech/CasaOS/milestone/13), it will be able to serve
as a drop-in replacement for this package.

## Running Locally

To run the app service locally, execute `npm start app-service` with the
following environment variables set:

```
NX_LOCAL = true
NX_CADDY_ROOT = "http://joshua-samizdapp.local"
APP_MANIFESTS_VOLUME = ./
SUPERVISOR_PATH = ./packages/app-service/src/supervisor.py
APP_API_ROOT = "http://localhost:3412/smz/api/app"
```

A `manifests.json` file will be created under the directory specified by
`APP_MANIFESTS_VOLUME`.
