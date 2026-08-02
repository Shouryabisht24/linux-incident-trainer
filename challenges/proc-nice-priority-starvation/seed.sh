#!/bin/sh
# Runs at build time as root.
#
# "batch-report-job" is the important, CPU-bound nightly job -- always
# launched the same way, at normal priority (nice 0), never user-configurable.
# "telemetry-agent" is a background metrics scraper that, per this box's own
# runbook, is supposed to always run deprioritized (niced up) so it never
# meaningfully competes with real work. Its niceness is config-driven and
# applied by its own control script at start. A recent redeploy reset that
# config back to the default (0) instead of the documented value, so it now
# runs at the *same* priority as batch-report-job.
#
# Both processes are pinned to the same CPU core on purpose (this box's
# premise: treat its 0.5 vCPU quota as a single core) -- that pin is fixed
# environment, not something to fix. It's what makes their relative
# `nice` values the thing that actually decides who gets the CPU: on a truly
# free core, niceness wouldn't matter much since neither would need to wait
# on the other; wedged onto one core together, it's the only thing that does.
set -eu

mkdir -p /etc/telemetry-agent /var/run

cat > /etc/telemetry-agent/telemetry-agent.conf <<'EOF'
# Niceness telemetry-agent is started with. Runbook: telemetry-agent must
# always be deprioritized (a high, i.e. low-priority, nice value) so it
# never meaningfully competes with real workloads for CPU. Regressed to the
# default (0) in a recent redeploy.
NICE_LEVEL=0
EOF

cat > /usr/local/bin/batch-report-job <<'EOF'
#!/bin/sh
# Stand-in for a CPU-bound batch job: busy work, forever.
while true; do :; done
EOF
chmod +x /usr/local/bin/batch-report-job

cat > /usr/local/bin/telemetry-agent <<'EOF'
#!/bin/sh
# Stand-in for a background metrics scraper: also CPU-bound, forever -- the
# point isn't what it computes, it's that it's supposed to yield to more
# important work via its niceness, not its code.
while true; do :; done
EOF
chmod +x /usr/local/bin/telemetry-agent

cat > /usr/local/bin/svc-ctl <<'EOF'
#!/bin/sh
# Minimal control script for telemetry-agent (no systemd in this image).
set -eu
PIDFILE=/var/run/telemetry-agent.pid
case "${1:-}" in
  start)
    . /etc/telemetry-agent/telemetry-agent.conf
    setsid taskset -c 0 nice -n "$NICE_LEVEL" /usr/local/bin/telemetry-agent \
      >>/var/log/telemetry-agent.log 2>&1 </dev/null &
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
