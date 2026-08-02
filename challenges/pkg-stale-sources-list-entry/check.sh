#!/bin/sh
# Solved when apt-get update actually succeeds AND the still-healthy
# internal mirror is genuinely usable (not just "no error message") --
# checking exit code alone would pass on a fluke; checking the mirror
# package resolves proves the whole pipeline works end to end.
set -u
if ! apt-get update >/tmp/pkg-check-update.out 2>&1; then
  echo "apt-get update still fails:"
  tail -5 /tmp/pkg-check-update.out
  rm -f /tmp/pkg-check-update.out
  exit 1
fi
rm -f /tmp/pkg-check-update.out

cand=$(apt-cache policy reportviewer 2>/dev/null | awk '/Candidate:/ {print $2}')
if [ -z "$cand" ] || [ "$cand" = "(none)" ]; then
  echo "reportviewer has no resolvable candidate -- internal mirror not actually usable"
  exit 1
fi

echo "apt-get update succeeds; internal mirror usable (reportviewer candidate: $cand)"
exit 0
