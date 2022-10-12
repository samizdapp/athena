#!/bin/bash

cd /usr/src
mv ./volumes/gateway_client/libp2p.bootstrap .
rm -rf ./volumes/gateway_client/*
cp -rf ./athena/dist/packages/gateway-client/. ./volumes/gateway_client
mv libp2p.bootstrap ./volumes/gateway_client/libp2p.bootstrap
sleep infinity
