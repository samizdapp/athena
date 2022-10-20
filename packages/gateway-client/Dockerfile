FROM herakles_athena:latest as build

RUN mkdir -p /usr/src/volumes/gateway_client

WORKDIR /usr/src/athena

COPY . .

RUN npm run build gateway-client


FROM node:18-alpine as run

RUN apk add --no-cache bash

WORKDIR /usr/src/athena

COPY --from=build /usr/src/athena/dist .
COPY ./packages/gateway-client/copy.sh ./gateway-client-copy.sh

CMD [ "/bin/bash", "./gateway-client-copy.sh"  ]
