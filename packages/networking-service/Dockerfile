ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/networking-service
RUN mkdir -p packages/shared/libp2p

COPY packages/networking-service packages/networking-service
COPY packages/shared/libp2p packages/shared/libp2p

RUN npm run build shared-libp2p 
RUN ./node_modules/.bin/nx run networking-service:build:production

FROM node:18-alpine as run

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/networking-service
RUN mkdir -p dist/packages/shared/libp2p

COPY --from=build /usr/src/athena/dist/packages/shared/libp2p dist/packages/shared/libp2p
COPY --from=build /usr/src/athena/dist/packages/networking-service dist/packages/networking-service

RUN apk add cmake git bash python3 make gcc g++
RUN apk add --update linux-headers
RUN cd dist/packages/networking-service && npm install

ENV NODE_TLS_REJECT_UNAUTHORIZED=0
CMD [ "sleep", "infinity"  ]