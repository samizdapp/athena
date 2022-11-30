ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/app-service

COPY packages/app-service packages/app-service
COPY packages/shared/api packages/shared/api

RUN npm run build app-service


FROM node:18-alpine as run

RUN apk add --no-cache bash docker-cli docker-cli-compose

WORKDIR /usr/src/athena

RUN mkdir -p dist/packages/app-service

COPY --from=build /usr/src/athena/dist/packages/app-service dist/packages/app-service

RUN cd dist/packages/app-service && npm install

CMD [ "/usr/local/bin/node", "dist/packages/app-service/main.js"  ]
