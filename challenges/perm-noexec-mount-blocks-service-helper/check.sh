#!/bin/sh
# Solved when the renderd SERVICE actually starts (discovered via
# `service renderd start`/`status`, not by directly invoking the helper
# script by hand). A stale pidfile/running instance is cleared first so
# every check is a genuine fresh start attempt.
set -u
service renderd stop >/dev/null 2>&1 || true
rm -f /var/run/renderd.pid

OUT=$(service renderd start 2>&1)
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "renderd failed to start:"
  echo "$OUT"
  exit 1
fi

if service renderd status >/dev/null 2>&1; then
  echo "renderd started successfully and is running"
  exit 0
fi

echo "renderd start reported success but status shows it is not running"
exit 1
