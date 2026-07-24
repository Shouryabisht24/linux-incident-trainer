#!/bin/sh
set -u
STATE=$(systemctl is-active reportd 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "reportd.service is active"
  exit 0
fi
echo "reportd.service is '$STATE' (expected active)"
exit 1
