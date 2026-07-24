#!/bin/sh
# Build time. The actual buildup is generated at container start against the
# bounded tmpfs (see Dockerfile CMD) -- nothing to bake into the image here.
set -eu
mkdir -p /var/cache/apt/archives/partial
