FROM node:18-alpine

RUN mkdir -p /usr/src/athena

WORKDIR /usr/src/athena

RUN apk add python3 make gcc g++ jq bash

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY .eslintrc.json .
COPY .prettierignore .
COPY .prettierrc .
COPY babel.config.json .
COPY jest.config.ts .
COPY jest.preset.js .
COPY nx.json .
COPY tsconfig.base.json .
COPY workspace.json .

RUN mkdir -p packages/shared

RUN jq '.projects | values[]' workspace.json -r | xargs -I %PACKAGE bash -c 'mkdir -p "%PACKAGE" && echo '"'{}'"' > "%PACKAGE/project.json"'
