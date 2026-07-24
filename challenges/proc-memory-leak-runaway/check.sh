#!/bin/sh
# Solved when the leaking cache-warmer process is gone. Excludes zombies
# (state Z) explicitly: this container's PID 1 is `sleep infinity`, which
# never reap()s, so a killed child lingers as <defunct> -- and `pgrep -f`
# still matches a zombie's name via /proc's comm fallback once its cmdline is
# gone. A zombie is dead weight, not a live memory leak, so it shouldn't
# count as "still running" here.
set -u
FOUND=0
for pid in $(pgrep -f cache-warmer 2>/dev/null); do
  STATE=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
  if [ "$STATE" != "Z" ]; then
    FOUND=1
  fi
done
if [ "$FOUND" -eq 1 ]; then
  echo "cache-warmer is still running and leaking memory"
  exit 1
fi
echo "no runaway cache-warmer process running"
exit 0
