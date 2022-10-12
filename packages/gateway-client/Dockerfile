FROM node:18-alpine

RUN apk add --no-cache bash
RUN apk add python3 make gcc g++

RUN mkdir -p /usr/src/athena
RUN mkdir -p /usr/src/volumes/gateway_client

WORKDIR /usr/src/athena

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

RUN npm run build gateway-client

CMD [ "/bin/bash", "./packages/gateway-client/copy.sh"  ]
