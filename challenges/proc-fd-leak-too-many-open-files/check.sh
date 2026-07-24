#!/bin/sh
# Solved when connd is actually running its full steady-state connection
# count (25 open fds), not stuck below it. Ignores zombie processes (this
# container's PID 1 never reaps children, so a killed connd can linger as
# <defunct>, which pgrep -f can still match by name).
set -u
TARGET=25
PID=""
for p in $(pgrep -f /usr/local/bin/connd 2>/dev/null); do
  STATE=$(awk '{print $3}' "/proc/$p/stat" 2>/dev/null)
  if [ "$STATE" != "Z" ]; then
    PID="$p"
  fi
done

if [ -z "$PID" ]; then
  echo "connd is not running"
  exit 1
fi

FDCOUNT=$(ls "/proc/$PID/fd" 2>/dev/null | wc -l)
if [ "$FDCOUNT" -ge "$TARGET" ]; then
  echo "connd is running with $FDCOUNT open fds (>= $TARGET target)"
  exit 0
fi
echo "connd is only holding $FDCOUNT open fds (needs >= $TARGET) -- still hitting its fd limit"
exit 1
