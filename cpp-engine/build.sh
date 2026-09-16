#!/usr/bin/env bash
set -e
g++ -std=c++17 -O2 main.cpp -o traffic_engine
printf 'Built traffic_engine successfully.\n'
