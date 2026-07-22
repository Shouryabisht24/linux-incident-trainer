#!/bin/sh
set -u
STATE=$(systemctl is-active apiserver 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "apiserver.service is active"
  exit 0
fi
echo "apiserver.service is '$STATE' (expected active)"
exit 1
