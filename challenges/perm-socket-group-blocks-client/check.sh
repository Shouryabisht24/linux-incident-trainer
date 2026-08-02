#!/bin/sh
# Solved when the UNPRIVILEGED "collector" account can actually connect to
# the daemon's socket and read its response (proves the socket's group is
# genuinely granting access, not just that root can connect -- root always
# could regardless).
set -u
OUT=$(sudo -u collector timeout 2 nc -U /run/metricsd/metricsd.sock 2>/dev/null)
if echo "$OUT" | grep -q "METRICSD_HELLO"; then
  echo "collector can connect to the metricsd socket"
  exit 0
fi
echo "collector still cannot connect to the metricsd socket"
exit 1
