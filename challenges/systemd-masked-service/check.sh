#!/bin/sh
set -u
STATE=$(systemctl is-active nginx 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "nginx.service is active"
  exit 0
fi
echo "nginx.service is '$STATE' (expected active)"
exit 1
