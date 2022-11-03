# TODO: Move install to base image
# Beause balena is running an old version of docker compose in a restricted
# environment, this will require that CI/CD be setup to publish the base
# image to a public repo that balena can pull from.

FROM node:18-alpine as install

RUN apk add python3 make gcc g++

RUN mkdir -p /usr/src/athena

WORKDIR /usr/src/athena

COPY package.json .
COPY package-lock.json .

RUN npm install


FROM install as build

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
