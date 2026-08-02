#!/bin/sh
# Solved when overlapping invocations of tally-processed.sh -- run exactly
# the way cron's own user would run them, launched concurrently rather than
# waiting on real minute-boundary overlap -- can never corrupt the shared
# total. We don't just grep the script for "flock": we actually fire off
# several real, concurrent invocations and check the arithmetic came out
# exactly right, which only happens if updates are genuinely serialized.
set -u

SCRIPT=/opt/scripts/tally-processed.sh
STATE=/var/lib/app/total-processed
N=6

echo 0 > "$STATE"

i=0
while [ "$i" -lt "$N" ]; do
  su -s /bin/sh -c "$SCRIPT" trainee >/dev/null 2>&1 &
  i=$((i + 1))
done
wait

FINAL=$(cat "$STATE" 2>/dev/null || echo "unreadable")

if [ "$FINAL" = "$N" ]; then
  echo "ran $N overlapping invocations concurrently; total is exactly $N -- no lost updates"
  exit 0
fi

echo "ran $N overlapping invocations concurrently; expected total $N but got '$FINAL' -- overlapping runs are still corrupting the shared state (missing lock)"
exit 1
