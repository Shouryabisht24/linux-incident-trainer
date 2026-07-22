#!/bin/sh
# Solved when the monitor user can actually execute the script.
set -u
if sudo -u monitor /usr/local/bin/healthcheck >/dev/null 2>&1; then
  echo "monitor user can execute /usr/local/bin/healthcheck"
  exit 0
fi
echo "monitor user still cannot execute /usr/local/bin/healthcheck"
exit 1
