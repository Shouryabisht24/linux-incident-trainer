#!/bin/sh
# Solved when the system's configured timezone genuinely has zero offset
# from UTC (so "0 2 * * *" means the same instant here as on every other
# fleet box, regardless of which UTC alias -- UTC, Etc/UTC, GMT, etc. -- was
# used to get there) AND the report job itself, run exactly the way cron's
# own user would run it, still succeeds. We check the real, live offset
# (`date +%z`) rather than grepping /etc/timezone for one exact spelling.
set -u

OFFSET=$(date +%z)
if [ "$OFFSET" != "+0000" ]; then
  echo "system timezone still has a non-zero UTC offset ($OFFSET) -- cron's \"0 2 * * *\" does not mean 02:00 UTC here"
  exit 1
fi

rm -f /var/lib/app/last-report

if ! su -s /bin/sh -c /opt/scripts/nightly-report.sh trainee >/tmp/nightly-report-check.out 2>&1; then
  echo "nightly-report.sh failed when run as trainee:"
  cat /tmp/nightly-report-check.out
  exit 1
fi

if [ -f /var/lib/app/last-report ]; then
  echo "system timezone offset is $OFFSET (UTC) and the report job still runs cleanly: $(cat /var/lib/app/last-report)"
  exit 0
fi

echo "report job ran but did not produce /var/lib/app/last-report"
exit 1
