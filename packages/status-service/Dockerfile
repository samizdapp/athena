ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/status-service

COPY packages/status-service packages/status-service
COPY packages/shared/api packages/shared/api

RUN npm run build status-service


FROM node:18-alpine as run

RUN apk add --no-cache bash

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/status-service

COPY --from=build /usr/src/athena/dist/packages/status-service dist/packages/status-service

RUN cd dist/packages/status-service && npm install

CMD [ "/usr/local/bin/node", "dist/packages/status-service/main.js"  ]
