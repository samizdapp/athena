ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/networking-service

COPY packages/networking-service packages/networking-service

RUN ./node_modules/.bin/nx run networking-service:build:production

FROM node:18-alpine as run

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/networking-service

COPY --from=build /usr/src/athena/dist/packages/networking-service dist/packages/networking-service
RUN cd dist/packages/networking-service && npm install

ENV NODE_TLS_REJECT_UNAUTHORIZED=0
CMD [ "/usr/local/bin/node", "dist/packages/networking-service/main.js"  ]