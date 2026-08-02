#!/bin/sh
# Solved when webapp-worker is actually running (started successfully via
# webappctl reading a resolvable config). Skip zombie matches defensively --
# a killed process can leave pgrep -f matching a <defunct> zombie's stale
# comm field.
set -u

for pid in $(pgrep -f /usr/local/bin/webapp-worker 2>/dev/null); do
  state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
  if [ "$state" != "Z" ]; then
    echo "webapp-worker is running (pid $pid)"
    exit 0
  fi
done

echo "webapp-worker is not running"
exit 1
