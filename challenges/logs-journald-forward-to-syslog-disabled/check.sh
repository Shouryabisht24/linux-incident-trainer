#!/bin/sh
# Solved when a fresh invoiced message actually reaches
# /var/log/invoiced/invoiced.log via the journald -> rsyslog forwarding
# pipeline (not just the journal itself, which always receives it).
set -u
MARK="MARK_$$_$(date +%s)"
logger -t invoiced "$MARK"

i=0
while [ "$i" -lt 10 ]; do
  if grep -q "$MARK" /var/log/invoiced/invoiced.log 2>/dev/null; then
    echo "invoiced messages are reaching /var/log/invoiced/invoiced.log"
    exit 0
  fi
  i=$((i + 1))
  sleep 0.3
done

echo "invoiced messages are still not reaching /var/log/invoiced/invoiced.log"
exit 1
