#!/bin/sh
# Solved when a line written via the app's logger is actually persisted to the
# log file (i.e. it's a real file, not /dev/null).
set -u
MARK="check-marker-$$-$(date +%s)"
/usr/local/bin/paymentd-log "$MARK" 2>/dev/null || true
if grep -q "$MARK" /var/log/paymentd/paymentd.log 2>/dev/null; then
  echo "log writes are being persisted"
  exit 0
fi
echo "log writes are still going nowhere (log not a real file?)"
exit 1
