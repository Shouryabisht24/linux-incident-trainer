#!/bin/sh
# Runs at build time as root. The break: the orderd log directory is owned by
# root:root with mode 755, so the unprivileged "orderd" service user (which is
# who the daemon actually runs as) cannot create or append to its log file.
# root would bypass this, but orderd is not root - so the break is real.
set -eu
useradd -r -s /usr/sbin/nologin orderd
mkdir -p /var/log/orderd
chown root:root /var/log/orderd
chmod 755 /var/log/orderd
