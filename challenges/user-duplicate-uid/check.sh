#!/bin/sh
# Solved when logshipper and metricsagent are distinct accounts with
# distinct UIDs (no duplicate UID anywhere in /etc/passwd), and each
# account's own home directory is actually owned by that account's current
# UID (proving the fix didn't just renumber the account while leaving its
# files pointing at the old, now-wrong UID).
set -u

UID_LOG=$(id -u logshipper 2>/dev/null) || true
UID_MET=$(id -u metricsagent 2>/dev/null) || true

if [ -z "${UID_LOG:-}" ] || [ -z "${UID_MET:-}" ]; then
  echo "logshipper or metricsagent account is missing entirely"
  exit 1
fi

if [ "$UID_LOG" = "$UID_MET" ]; then
  echo "logshipper and metricsagent still share the same UID ($UID_LOG)"
  exit 1
fi

DUP_COUNT=$(awk -F: '{print $3}' /etc/passwd | sort | uniq -d | wc -l)
if [ "$DUP_COUNT" -ne 0 ]; then
  echo "a duplicate UID still exists somewhere in /etc/passwd"
  exit 1
fi

MET_HOME_OWNER=$(stat -c %u /home/metricsagent 2>/dev/null) || true
LOG_HOME_OWNER=$(stat -c %u /home/logshipper 2>/dev/null) || true
LOG_DATA_OWNER=$(stat -c %u /var/lib/logship/data/shipment.log 2>/dev/null) || true

if [ "$MET_HOME_OWNER" = "$UID_MET" ] && [ "$LOG_HOME_OWNER" = "$UID_LOG" ] && [ "$LOG_DATA_OWNER" = "$UID_LOG" ]; then
  echo "logshipper and metricsagent are distinct, correctly-owned accounts"
  exit 0
fi
echo "UIDs are distinct but file ownership is inconsistent"
exit 1
