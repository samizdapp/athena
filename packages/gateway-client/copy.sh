#!/bin/bash

cd /usr/src
mv ./volumes/gateway_client/assets/libp2p.* .
rm -rf ./volumes/gateway_client/*
cp -rf ./athena/packages/gateway-client/. ./volumes/gateway_client
mv libp2p.* /usr/src/volumes/gateway_client
sleep infinity
