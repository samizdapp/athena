ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN mkdir -p packages/app-service

COPY packages/app-service packages/app-service
COPY packages/shared/api packages/shared/api

RUN npm run build app-service


FROM node:18-alpine as run

RUN apk add --no-cache bash python3 py3-pip docker-cli docker-cli-compose poetry

RUN ln -fs /usr/bin/python3 /usr/bin/python

WORKDIR /usr/src/athena

COPY pyproject.toml pyproject.toml
COPY poetry.lock poetry.lock

RUN POETRY_VIRTUALENVS_CREATE=0 poetry install

RUN mkdir -p dist/packages/app-service

COPY --from=build /usr/src/athena/dist/packages/app-service dist/packages/app-service
ENV SUPERVISOR_PATH=/usr/src/athena/dist/packages/app-service/supervisor.py

RUN cd dist/packages/app-service && npm install

ENV APP_MANIFESTS_VOLUME=/usr/src/volumes/app_manifests
ENV APP_API_ROOT=http://localhost:3412/smz/api/app
RUN mkdir -p $APP_MANIFESTS_VOLUME

CMD [ "/usr/local/bin/node", "dist/packages/app-service/main.js"  ]
