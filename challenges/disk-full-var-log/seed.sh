#!/bin/sh
# Build-time. Nothing to bake into the image itself here: the break (a full
# filesystem) is created at container start against the size-bounded tmpfs
# mounted at /var/log/app (see Dockerfile CMD and challenge.json "tmpfs").
set -eu
mkdir -p /var/log/app
