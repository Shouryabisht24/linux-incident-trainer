#!/bin/sh
# Solved when (a) the cron job actually redirects its output somewhere real
# -- so a future failure won't vanish again -- and (b) the job itself now
# succeeds when run exactly the way cron runs it. We don't wait for the
# schedule; we look up the job line and run it ourselves.
set -u

CRONFILE=/etc/cron.d/rotate-metrics
JOBLINE=$(grep -E 'rotate-metrics\.sh' "$CRONFILE" 2>/dev/null | grep -v '^#' | tail -1)

if [ -z "$JOBLINE" ]; then
  echo "no job line found in $CRONFILE"
  exit 1
fi

if ! printf '%s' "$JOBLINE" | grep -q '>'; then
  echo "cron job still has no output redirection -- a future failure will vanish silently:"
  echo "  $JOBLINE"
  exit 1
fi

rm -f /var/lib/metrics/archive/*.log

if ! su -s /bin/sh -c /opt/scripts/rotate-metrics.sh trainee >/tmp/rotate-check.out 2>&1; then
  echo "rotate-metrics.sh still fails when run the way cron runs it:"
  cat /tmp/rotate-check.out
  exit 1
fi

if ls /var/lib/metrics/archive/*.log >/dev/null 2>&1; then
  echo "job succeeds and its output is no longer silently discarded"
  exit 0
fi

echo "job did not produce an archive file"
exit 1
