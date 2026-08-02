#!/bin/sh
# Solved when:
#  1. /var/crash actually has a healthy amount of free space back, and
#  2. running the crash loop one more time does NOT leave a fresh core dump
#     behind (i.e. the underlying ulimit was actually fixed, not just today's
#     mess cleaned up).
set -u

AVAIL=$(df -m --output=avail /var/crash 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0
if [ "$AVAIL" -lt 8 ]; then
  echo "/var/crash is still nearly full (${AVAIL}MB free) -- clean up the accumulated core dumps"
  exit 1
fi

BEFORE_COUNT=$(find /var/crash -name core 2>/dev/null | wc -l)
/usr/local/bin/worker-supervisor >/dev/null 2>&1 || true
AFTER_COUNT=$(find /var/crash -name core 2>/dev/null | wc -l)

if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
  echo "/var/crash has ${AVAIL}MB free, but worker-supervisor still leaves a fresh core dump behind -- the core limit itself isn't fixed yet"
  exit 1
fi

echo "/var/crash has ${AVAIL}MB free and the crash loop no longer leaves core dumps behind"
exit 0
