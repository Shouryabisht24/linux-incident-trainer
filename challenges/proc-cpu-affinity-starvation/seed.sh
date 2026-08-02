#!/bin/sh
# Runs at build time as root.
#
# "render-worker" is a CPU-bound job-queue worker: at steady state it should
# be pegging close to a full core's worth of throughput. Its startup config
# pins it to a specific CPU core via `taskset` (PINNED_CORE in
# render-worker.conf) -- a leftover from a NUMA/cache-locality tuning attempt.
# That pin was fine when it was set, but a separate, legitimate workload
# ("batch-encoder", not something this challenge asks you to touch) is
# *also* permanently pinned to that exact same core and fully saturates it.
# The container is given generous overall CPU quota (2 vCPUs) specifically so
# that "other cores are free" is actually true and observable -- the box as a
# whole is nowhere near its quota, render-worker is just artificially wedged
# onto the one core that's already spoken for. Moving it off that core (or
# no longer pinning it at all) resolves the starvation immediately, with no
# code change needed.
set -eu

mkdir -p /etc/render-worker /var/log/render-worker /var/run/render-worker

cat > /etc/render-worker/render-worker.conf <<'EOF'
# CPU core render-worker is pinned to via taskset at startup. Leftover from a
# cache-locality tuning experiment. Leave empty (PINNED_CORE=) to let the
# scheduler place it on whatever core is actually free.
PINNED_CORE=0
EOF

cat > /usr/local/bin/render-worker <<'EOF'
#!/bin/sh
# Stand-in for a CPU-bound render job: busy work, forever. No sleeps -- a
# real render-worker keeps its core as busy as it's allowed to.
while true; do :; done
EOF
chmod +x /usr/local/bin/render-worker

cat > /usr/local/bin/batch-encoder <<'EOF'
#!/bin/sh
# A separate, pre-existing CPU-bound workload. Always pinned to core 0 by
# its own launcher (see this challenge's Dockerfile CMD) -- not part of what
# you're asked to fix, just the reason core 0 is fully spoken for.
while true; do :; done
EOF
chmod +x /usr/local/bin/batch-encoder

cat > /usr/local/bin/svc-ctl <<'EOF'
#!/bin/sh
# Minimal control script for render-worker (no systemd in this image).
set -eu
PIDFILE=/var/run/render-worker/render-worker.pid
case "${1:-}" in
  start)
    . /etc/render-worker/render-worker.conf
    if [ -n "${PINNED_CORE:-}" ]; then
      setsid taskset -c "$PINNED_CORE" /usr/local/bin/render-worker \
        >>/var/log/render-worker/render-worker.log 2>&1 </dev/null &
    else
      setsid /usr/local/bin/render-worker \
        >>/var/log/render-worker/render-worker.log 2>&1 </dev/null &
    fi
    echo $! > "$PIDFILE"
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then
      kill -9 "$(cat "$PIDFILE")" 2>/dev/null || true
      rm -f "$PIDFILE"
    fi
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  *)
    echo "usage: svc-ctl {start|stop|restart}" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/svc-ctl
