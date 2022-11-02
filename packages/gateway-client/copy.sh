#!/bin/bash

cd /usr/src
mv ./volumes/gateway_client/assets/libp2p.* .
rm -rf ./volumes/gateway_client/*
cp -rf ./athena/dist/packages/gateway-client/. ./volumes/gateway_client
mv libp2p.* ./volumes/gateway_client/assets
sleep infinity
