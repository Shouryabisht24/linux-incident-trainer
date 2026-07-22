#!/bin/sh
# Verifies the REAL unprivileged actor (user "orderd") can write to the log dir.
# Runs as root, but tests the outcome as the orderd user via sudo -u.
set -u
if sudo -u orderd sh -c 'echo probe >> /var/log/orderd/orderd.log' 2>/dev/null; then
  echo "orderd user can write to /var/log/orderd"
  exit 0
fi
echo "orderd user still cannot write to /var/log/orderd"
exit 1
