#!/bin/sh
# Solved when pool-supervisor is no longer running (stops the leak from
# growing further) AND the pids cgroup has real headroom again (proves the
# already-leaked job-worker children were actually cleaned up, not just that
# the supervisor was killed while its pool sits at the ceiling). Ignores
# zombie processes when checking "is it still running" -- this container's
# PID 1 never reaps children, so a killed process can linger as <defunct>,
# and pgrep-style name matching can still match a zombie.
set -u
PIDFILE=/var/run/pool-supervisor.pid
MAX_HEALTHY_CURRENT=15 # out of a pids.max of 40 -- comfortable headroom

SUPERVISOR_RUNNING=0
if [ -f "$PIDFILE" ]; then
  SPID=$(cat "$PIDFILE")
  if [ -d "/proc/$SPID" ]; then
    STATE=$(awk '{print $3}' "/proc/$SPID/stat" 2>/dev/null)
    [ "$STATE" != "Z" ] && SUPERVISOR_RUNNING=1
  fi
fi

if [ "$SUPERVISOR_RUNNING" -eq 1 ]; then
  echo "pool-supervisor is still running and still growing the worker pool"
  exit 1
fi

CURRENT=$(cat /sys/fs/cgroup/pids.current 2>/dev/null || echo -1)
if [ "$CURRENT" -lt 0 ]; then
  echo "could not read /sys/fs/cgroup/pids.current"
  exit 1
fi

if [ "$CURRENT" -le "$MAX_HEALTHY_CURRENT" ]; then
  echo "pool-supervisor is stopped and pids.current=$CURRENT (<= $MAX_HEALTHY_CURRENT) -- real headroom restored"
  exit 0
fi
echo "pool-supervisor is stopped but pids.current=$CURRENT is still too high (need <= $MAX_HEALTHY_CURRENT) -- leaked job-worker processes are still holding pid slots"
exit 1
