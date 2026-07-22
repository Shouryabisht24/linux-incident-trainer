#!/bin/sh
set -u
STATE=$(systemctl is-active webapp 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "webapp.service is active"
  exit 0
fi
echo "webapp.service is '$STATE' (expected active)"
exit 1
