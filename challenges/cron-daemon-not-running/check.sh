#!/bin/sh
# Solved when the cron daemon is running.
set -u
if pgrep -x cron >/dev/null 2>&1; then
  echo "cron daemon is running"
  exit 0
fi
echo "cron daemon is not running"
exit 1
