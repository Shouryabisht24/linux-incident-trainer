#!/bin/sh
set -u
STATE=$(systemctl is-active billing-worker 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "billing-worker.service is active"
  exit 0
fi
echo "billing-worker.service is '$STATE' (expected active)"
exit 1
