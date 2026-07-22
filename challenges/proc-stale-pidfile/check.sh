#!/bin/sh
# Solved when the queue-worker daemon is actually running.
set -u
if pgrep -f /usr/local/bin/queue-worker >/dev/null 2>&1; then
  echo "queue-worker is running"
  exit 0
fi
echo "queue-worker is not running"
exit 1
