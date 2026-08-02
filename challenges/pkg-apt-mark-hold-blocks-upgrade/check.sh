#!/bin/sh
# Solved when widget-cli's --health subcommand (added in 2.0-1) actually works.
set -u
out=$(widget-cli --health 2>&1)
rc=$?
if [ $rc -eq 0 ] && [ "$out" = "OK" ]; then
  echo "widget-cli --health reports OK"
  exit 0
fi
echo "widget-cli --health still failing (rc=$rc, out=$out)"
exit 1
