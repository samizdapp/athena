ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/gateway-client

COPY packages/gateway-client packages/gateway-client
COPY packages/shared/api packages/shared/api
COPY packages/shared/service-worker packages/shared/service-worker

RUN npm run build gateway-client


FROM node:18-alpine as run

RUN apk add --no-cache bash

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/gateway-client

COPY --from=build /usr/src/athena/dist/packages/gateway-client dist/packages/gateway-client
COPY ./packages/gateway-client/copy.sh ./gateway-client-copy.sh

RUN mkdir -p /usr/src/volumes/gateway_client

CMD [ "/bin/bash", "./gateway-client-copy.sh"  ]
