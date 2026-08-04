#!/bin/sh
set -u
STATE=$(systemctl is-active metrics-agent 2>/dev/null)
if [ "$STATE" = "active" ]; then
  echo "metrics-agent.service is active"
  exit 0
fi
echo "metrics-agent.service is '$STATE' (expected active)"
exit 1
