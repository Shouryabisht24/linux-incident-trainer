#!/bin/sh
# Solved when the job actually succeeds run the way cron itself would run
# it: with cron's own environment, not the trainee's interactive shell
# (which has a much wider PATH via /etc/profile.d and would mask this bug).
# Reproduces cron's PATH from the cron.d file's own PATH= line if one has
# been added, falling back to cron's real default otherwise -- rather than
# waiting on an actual minute-boundary trigger.
set -u
rm -f /var/lib/app/sync.done

CRONFILE=/etc/cron.d/sync-job
JOBPATH=$(awk -F= '/^PATH=/{print $2; exit}' "$CRONFILE" 2>/dev/null)
[ -z "$JOBPATH" ] && JOBPATH="/usr/bin:/bin"

env -i PATH="$JOBPATH" HOME=/home/trainee /opt/scripts/sync-data.sh >/tmp/cron-path-check.out 2>&1

if [ -f /var/lib/app/sync.done ]; then
  echo "sync-data.sh succeeded under cron's own PATH ($JOBPATH)"
  exit 0
fi
echo "sync-data.sh still fails under cron's PATH ($JOBPATH):"
cat /tmp/cron-path-check.out
exit 1
