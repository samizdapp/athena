ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/networking-service

COPY packages/networking-service packages/networking-service
COPY packages/shared/api packages/shared/api

RUN npm run build networking-service

FROM node:18-alpine as run

RUN apk add --no-cache bash python3 py3-pip docker-cli docker-cli-compose poetry

RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/networking-service

COPY --from=build /usr/src/athena/dist/packages/networking-service dist/packages/networking-service
RUN cd dist/packages/networking-service && npm install

ENV YGGDRASIL_API_ROOT=tcp://localhost:2019

CMD [ "/usr/local/bin/node", "dist/packages/networking-service/main.js"  ]