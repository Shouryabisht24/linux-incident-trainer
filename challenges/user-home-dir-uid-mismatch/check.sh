#!/bin/sh
# Solved when the REAL "reports" account (whatever UID it currently has) can
# actually read and write its own data file -- not just when the numbers
# happen to look consistent.
set -u
if sudo -u reports sh -c 'test -r /home/reports/data/report.csv && echo probe >> /home/reports/data/report.csv' 2>/dev/null; then
  echo "reports can read and write its own data"
  exit 0
fi
echo "reports still cannot access /home/reports/data/report.csv"
exit 1
