#!/bin/sh
# Solved when batch-dispatcher itself is no longer running (stops the leak
# from growing further -- a supervisor/orchestrator is assumed to handle any
# already-dead zombie entries left behind, the same way a real process
# table's zombies clear on their own once whatever's actually watching this
# box reaps or restarts). Ignores zombie processes when looking for
# "running": this container's PID 1 never reaps children, so a killed
# dispatcher can itself linger as <defunct>, and pgrep -f can still match a
# zombie's name.
set -u
FOUND=0
for pid in $(pgrep -f /usr/local/bin/batch-dispatcher 2>/dev/null); do
  STATE=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
  if [ "$STATE" != "Z" ]; then
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "batch-dispatcher is still running and still leaking zombies"
  exit 1
fi
echo "batch-dispatcher is no longer running"
exit 0
