#!/bin/sh
# Solved when a fresh log message actually reaches /var/log/app/app.log.
# Emits its own uniquely-tagged message and checks for it directly, rather
# than relying on old data or waiting on real app traffic.
set -u
MARK="MARKER_$$_$(date +%s)"
logger -p local0.info "$MARK"
sleep 1

if grep -q "$MARK" /var/log/app/app.log 2>/dev/null; then
  echo "local0 messages are reaching /var/log/app/app.log"
  exit 0
fi
echo "local0 messages are still not reaching /var/log/app/app.log"
exit 1
