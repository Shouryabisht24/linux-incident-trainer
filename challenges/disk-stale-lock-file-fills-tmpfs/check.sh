#!/bin/sh
# Solved when eventqueue-worker is actually running AND there is healthy free
# space back in /var/lib/eventqueue (not just a process that happened to
# start while the tmpfs was still nearly full).
set -u

SPOOL=/var/lib/eventqueue
AVAIL=$(df -m --output=avail "$SPOOL" 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0

RUNNING=0
for pid in $(pgrep -f /usr/local/bin/eventqueue-worker 2>/dev/null); do
  state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
  [ "$state" != "Z" ] && RUNNING=1
done

if [ "$RUNNING" -ne 1 ]; then
  echo "eventqueue broker is not running"
  exit 1
fi
if [ "$AVAIL" -lt 8 ]; then
  echo "eventqueue broker is running but only ${AVAIL}MB free in $SPOOL"
  exit 1
fi

echo "eventqueue broker is running with ${AVAIL}MB free in $SPOOL"
exit 0
