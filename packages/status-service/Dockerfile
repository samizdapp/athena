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

COPY package.json .
COPY package-lock.json .

RUN NODE_ENV=production npm install

COPY --from=build /usr/src/athena/dist/packages/status-service dist/packages/status-service 

CMD [ "/usr/local/bin/node", "dist/packages/status-service/main.js"  ]
