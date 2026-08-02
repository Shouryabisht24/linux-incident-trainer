#!/bin/sh
# Solved when apiworker.service is active AND actually holding its full
# steady-state connection count (40 open fds), not just "active" while stuck
# below target (Restart=always keeps it "active"-looking even mid-crash-loop
# recovery, so is-active alone isn't enough evidence).
set -u
TARGET=40

STATE=$(systemctl is-active apiworker 2>/dev/null)
if [ "$STATE" != "active" ]; then
  echo "apiworker.service is '$STATE' (expected active)"
  exit 1
fi

PID=$(systemctl show apiworker --property=MainPID --value 2>/dev/null)
if [ -z "$PID" ] || [ "$PID" = "0" ]; then
  echo "apiworker.service is active but has no MainPID"
  exit 1
fi

FDCOUNT=$(ls "/proc/$PID/fd" 2>/dev/null | wc -l)
if [ "$FDCOUNT" -ge "$TARGET" ]; then
  echo "apiworker is active with $FDCOUNT open fds (>= $TARGET target)"
  exit 0
fi
echo "apiworker is active but only holding $FDCOUNT open fds (needs >= $TARGET) -- still hitting a file-descriptor ceiling"
exit 1
