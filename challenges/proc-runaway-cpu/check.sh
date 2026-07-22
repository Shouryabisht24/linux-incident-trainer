#!/bin/sh
# Solved when the runaway report-generator process is gone.
set -u
if pgrep -f report-generator >/dev/null 2>&1; then
  echo "report-generator is still running and burning CPU"
  exit 1
fi
echo "no runaway report-generator process running"
exit 0
