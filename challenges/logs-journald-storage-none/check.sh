#!/bin/sh
# Solved when a message sent through the journal right now actually shows up
# in journalctl right now (not a reboot-persistence check -- this is about
# whether anything is retained at all).
set -u
MARK="check-marker-$$-$(date +%s)"
logger -t telemetryd "$MARK" 2>/dev/null

# journald batches slightly; give it a brief moment.
i=0
while [ "$i" -lt 10 ]; do
  if journalctl -t telemetryd --no-pager 2>/dev/null | grep -q "$MARK"; then
    echo "messages are being retained and are queryable via journalctl"
    exit 0
  fi
  i=$((i + 1))
  sleep 0.3
done

echo "message never showed up in journalctl -- journald is retaining nothing"
exit 1
