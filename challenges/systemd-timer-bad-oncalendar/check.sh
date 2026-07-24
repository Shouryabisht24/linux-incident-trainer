#!/bin/sh
# Solved when cleanup.timer actually loaded, is active, and has a real next
# scheduled trigger time -- not just when the file has been edited.
set -u
STATE=$(systemctl is-active cleanup.timer 2>/dev/null)
if [ "$STATE" != "active" ]; then
  echo "cleanup.timer is '$STATE' (expected active)"
  exit 1
fi

NEXT=$(systemctl show cleanup.timer -p NextElapseUSecRealtime --value 2>/dev/null)
if [ -z "$NEXT" ] || [ "$NEXT" = "n/a" ]; then
  echo "cleanup.timer is active but has no valid next trigger time"
  exit 1
fi

echo "cleanup.timer is active with a scheduled next run: $NEXT"
exit 0
