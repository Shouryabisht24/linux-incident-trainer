#!/bin/sh
# Solved when a FRESHLY generated report (run right now, as the real
# "reportgen" actor -- not waiting on cron's own schedule, per the
# time-based-mechanism guidance) can actually be read by the UNPRIVILEGED
# "dashboard" account. Root could always read it -- this exercises the
# real, separate consumer process.
set -u
rm -f /var/lib/reports/report-*.txt

sudo -u reportgen /usr/local/bin/generate-report.sh

LATEST=$(ls -t /var/lib/reports/report-*.txt 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "no report file was generated -- generation script itself may be broken"
  exit 1
fi

OUT=$(sudo -u dashboard cat "$LATEST" 2>/dev/null)
if echo "$OUT" | grep -q "REPORT_MARKER_OK"; then
  echo "dashboard can read the latest report ($LATEST)"
  exit 0
fi

echo "dashboard still cannot read the latest report ($LATEST):"
ls -la "$LATEST"
exit 1
