#!/bin/sh
# Runs at build time as root.
#
# "pool-supervisor" is meant to maintain a small, fixed pool of long-running
# "job-worker" processes. A reconciliation bug means it has no real upper
# bound on pool size -- it just keeps adding one more worker as long as the
# container's process-count (pids) cgroup has any headroom left at all,
# checked directly against /sys/fs/cgroup/pids.current vs pids.max. It never
# decides "the pool is big enough" on its own.
#
# It's throttled to leave a small safety margin (a few pid slots) rather
# than spinning as fast as possible against a hard wall -- once headroom
# drops to that margin it backs off to a long retry interval instead of
# hammering fork() every second -- but it never actually stops trying, and
# it never cleans up a single worker it has already spawned. Left running,
# this box's process table creeps toward, and then sits pinned right at the
# edge of, "cannot create a new process at all" -- exactly the scenario this
# container's tight pidsLimit (see challenge.json resource_limits) is meant
# to make bite for real, not just in theory.
set -eu

mkdir -p /var/run/worker-pool

cat > /usr/local/bin/job-worker <<'EOF'
#!/bin/sh
# A persistent pool worker. Does nothing -- the point is that it exists and
# holds a pid slot, not what it computes.
exec sleep infinity
EOF
chmod +x /usr/local/bin/job-worker

cat > /usr/local/bin/pool-supervisor <<'EOF'
#!/bin/sh
# BUG: no target pool size, no upper bound -- reconciliation always concludes
# "add one more" as long as the pids cgroup has more than a thin safety
# margin of headroom left. Never reaps or caps what it has already spawned.
: > /var/run/worker-pool/pids
while true; do
  CURRENT=$(cat /sys/fs/cgroup/pids.current 2>/dev/null || echo 0)
  RAWMAX=$(cat /sys/fs/cgroup/pids.max 2>/dev/null || echo max)
  case "$RAWMAX" in
    max|'') MAX=999999 ;;
    *) MAX=$RAWMAX ;;
  esac
  HEADROOM=$((MAX - CURRENT))
  if [ "$HEADROOM" -gt 3 ]; then
    /usr/local/bin/job-worker &
    echo "$!" >> /var/run/worker-pool/pids
    sleep 1
  else
    echo "pool-supervisor: no headroom left (pids.current=$CURRENT pids.max=$MAX), will retry later"
    sleep 60
  fi
done
EOF
chmod +x /usr/local/bin/pool-supervisor
