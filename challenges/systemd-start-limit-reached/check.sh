#!/bin/sh
set -u
STATE=$(systemctl is-active worker2 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "worker2.service is active"
  exit 0
fi
echo "worker2.service is '$STATE' (expected active)"
exit 1
