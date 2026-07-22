#!/bin/sh
# Solved when the /var/log/app filesystem has been freed up to a healthy level.
set -u
AVAIL=$(df -m --output=avail /var/log/app 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0
if [ "$AVAIL" -ge 8 ]; then
  echo "/var/log/app has ${AVAIL}MB free"
  exit 0
fi
echo "/var/log/app is still nearly full (${AVAIL}MB free)"
exit 1
