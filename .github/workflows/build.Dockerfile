ARG VERSION=latest
FROM ghcr.io/samizdapp/athena:$VERSION as build

WORKDIR /usr/src/athena

RUN apk add git

COPY . .

ARG BASE=origin/master

CMD [ "/bin/bash", "npm", "run", "nx", "--", "affected", "--target=build", "--base=$BASE"  ]
