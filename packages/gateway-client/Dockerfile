FROM node:18-alpine

RUN apk add --no-cache bash

RUN mkdir -p /usr/src/athena
RUN mkdir -p /usr/src/volumes/gateway_client

WORKDIR /usr/src/athena

COPY . .

RUN npm install
RUN npm run build gateway-client

CMD [ "/bin/bash", "./packages/gateway-client/copy.sh"  ]
