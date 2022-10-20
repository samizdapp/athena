FROM node:18-alpine as build

RUN apk add python3 make gcc g++

RUN mkdir -p /usr/src/athena

WORKDIR /usr/src/athena

COPY package.json .
COPY package-lock.json .

RUN npm install
