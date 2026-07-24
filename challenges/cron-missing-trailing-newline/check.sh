#!/bin/sh
# Solved when the crontab file both still contains the real job line AND
# ends with a newline -- a newline-terminated last line is the exact,
# necessary precondition for cron to accept it at all (rather than waiting
# on a real 5-minute schedule tick to prove it).
set -u
FILE=/etc/cron.d/nightly-sync

if ! grep -q 'nightly-sync.sh' "$FILE" 2>/dev/null; then
  echo "the job line itself is missing from $FILE"
  exit 1
fi

LAST_BYTE=$(tail -c 1 "$FILE" | od -An -c | tr -d ' ')
if [ "$LAST_BYTE" = '\n' ]; then
  echo "$FILE ends with a newline -- cron will accept the last line"
  exit 0
fi
echo "$FILE does NOT end with a newline -- cron will silently ignore the last line"
exit 1
