#!/bin/sh
# Solved when a line written via reportd's logger is actually persisted and
# readable back from its configured log path.
set -u
MARK="check-marker-$$-$(date +%s)"
LOGFILE=$(sed -n 's/^LogFile=//p' /etc/reportd/reportd.conf 2>/dev/null)
/usr/local/bin/reportd-log "$MARK" 2>/dev/null || true

if [ -n "$LOGFILE" ] && [ -e "$LOGFILE" ] && grep -q "$MARK" "$LOGFILE" 2>/dev/null; then
  echo "log writes are being persisted to $LOGFILE"
  exit 0
fi

echo "log writes to $LOGFILE are still not sticking"
exit 1
