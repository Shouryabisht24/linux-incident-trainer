#!/bin/sh
# Build-time. The break (inode exhaustion) is created at container start against
# the inode-limited tmpfs at /var/spool/ingest (see Dockerfile CMD + challenge.json).
set -eu
mkdir -p /var/spool/ingest
