#!/bin/sh
# Solved when the apt archive cache has been cleared and the filesystem
# backing it has a healthy amount of free space again.
set -u
AVAIL=$(df -m --output=avail /var/cache/apt/archives 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0
if [ "$AVAIL" -ge 10 ]; then
  echo "/var/cache/apt/archives has ${AVAIL}MB free"
  exit 0
fi
echo "/var/cache/apt/archives is still nearly full (${AVAIL}MB free)"
exit 1
