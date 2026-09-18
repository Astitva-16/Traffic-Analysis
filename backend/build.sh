#!/bin/bash

set -e

echo "Building C++ traffic engine..."

g++ -O2 -std=c++17 cpp-engine/main.cpp -o cpp-engine/traffic_engine

echo "C++ engine built successfully."