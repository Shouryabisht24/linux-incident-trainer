#!/bin/sh
# Solved when a fresh process can actually acquire dpkg's frontend lock --
# the real, direct test of whether anything is still holding it, rather than
# checking a PID or a file's mere existence.
set -u
if flock -n -x /var/lib/dpkg/lock-frontend -c true 2>/dev/null; then
  echo "dpkg's frontend lock is free"
  exit 0
fi
echo "dpkg's frontend lock is still held by something"
exit 1
