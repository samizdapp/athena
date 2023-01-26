# Status Service

A NestJS app.

Other services running on the box continually report their current status to
the `status-service`.

## Status is Current, Not Historical

The `status-service` tracks statuses using a `Log` model; however, only the
last 5 logs from each service are stored.

A service is expected to send it's status at least every 5 minutes, any older
logs are considered out of date. Any service without recent logs will be
assumed to have lost connectivity. It is recommended that services send their
status no less often than every 4 minutes, to avoid possible windows of no
valid logs.

## Pending Work

Most services are not currently sending their status to the status service:

-   https://github.com/samizdapp/herakles/issues/182
-   https://github.com/samizdapp/herakles/issues/172
-   https://github.com/samizdapp/herakles/issues/175
-   https://github.com/samizdapp/herakles/issues/173
-   https://github.com/samizdapp/herakles/issues/177

Additionally, many services have statuses for multiple components that are
richer than just the overall status of the service. Some work needs to be done
to add metadata to a service's status:

-   https://github.com/samizdapp/herakles/issues/182
-   https://github.com/samizdapp/herakles/issues/176

## Running Locally

To run the status service locally, execute `npm start status-service` with the
following environment variables set:

```
NX_LOCAL = true
NX_CADDY_ROOT = "http://joshua-samizdapp.local"
```
