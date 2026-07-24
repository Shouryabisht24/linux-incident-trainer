#!/bin/sh
# Solved when forcing logrotate to run actually rotates the real, current
# billing log (not a path that no longer exists).
set -u
rm -f /var/log/billing/billing.log.1 /var/lib/logrotate/status

BEFORE_SIZE=$(stat -c %s /var/log/billing/billing.log 2>/dev/null || echo 0)
if [ "$BEFORE_SIZE" -eq 0 ]; then
  echo "setup problem: /var/log/billing/billing.log is missing or empty"
  exit 1
fi

logrotate --force /etc/logrotate.d/billing >/tmp/logrotate-check.out 2>&1

if [ -f /var/log/billing/billing.log.1 ]; then
  AFTER_SIZE=$(stat -c %s /var/log/billing/billing.log 2>/dev/null || echo -1)
  if [ "$AFTER_SIZE" -eq 0 ]; then
    echo "billing.log was rotated (billing.log.1 created, billing.log truncated)"
    exit 0
  fi
fi

echo "billing.log was NOT rotated:"
cat /tmp/logrotate-check.out
exit 1
