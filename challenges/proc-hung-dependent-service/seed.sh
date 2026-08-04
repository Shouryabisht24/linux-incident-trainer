#!/bin/sh
# Runs at build time as root.
#
# "event-shipper" forwards events to "log-collector" over a named pipe
# (/run/app.pipe). Opening a FIFO for writing blocks in the kernel until
# some reader has it open for reading -- that's normal, expected pipe
# semantics, not a bug in event-shipper. The actual break is in
# /etc/telemetry/services.conf: it's supposed to list both services, but a
# typo/edit dropped "log-collector" from the list, so only event-shipper
# ever gets started. With no reader ever opening the pipe, event-shipper's
# very first write blocks forever -- not spinning a CPU, not a zombie, just
# genuinely, indefinitely stuck (state S, wchan is a real, readable signal:
# "wait_for_partner"). Starting the missing reader is enough to unblock it
# immediately; event-shipper itself never needs to be touched or restarted.
set -eu

mkdir -p /run /var/log/telemetry /var/run/telemetry
mkfifo /run/app.pipe

mkdir -p /etc/telemetry
cat > /etc/telemetry/services.conf <<'EOF'
# Services svc-ctl starts. Should be "event-shipper log-collector" -- an
# edit dropped log-collector from this list.
SERVICES="event-shipper"
EOF

cat > /usr/local/bin/event-shipper <<'EOF'
#!/bin/sh
# Forwards one heartbeat event every 2s over the shared pipe. Opening the
# pipe for writing blocks until a reader exists -- expected FIFO behavior.
exec 3>/run/app.pipe
while true; do
  date +%s >&3
  sleep 2
done
EOF
chmod +x /usr/local/bin/event-shipper

cat > /usr/local/bin/log-collector <<'EOF'
#!/bin/sh
# Continuously drains the pipe into the collected-events log. Wrapped in a
# loop since a `cat` on a FIFO returns at EOF once its writer closes.
mkdir -p /var/log/telemetry
while true; do
  cat /run/app.pipe >> /var/log/telemetry/events.log
done
EOF
chmod +x /usr/local/bin/log-collector

cat > /usr/local/bin/svc-ctl <<'EOF'
#!/bin/sh
# Minimal control script for the telemetry pipeline (no systemd in this
# image). Reads the service list from config; each named service also has a
# start action here regardless of whether it's currently listed, so a
# missing-from-the-list service can still be started directly by name.
set -eu
. /etc/telemetry/services.conf
PIDDIR=/var/run/telemetry
mkdir -p "$PIDDIR"

start_one() {
  case "$1" in
    event-shipper)
      setsid /usr/local/bin/event-shipper >>/var/log/telemetry/event-shipper.log 2>&1 </dev/null &
      echo "$!" > "$PIDDIR/event-shipper.pid"
      ;;
    log-collector)
      setsid /usr/local/bin/log-collector >>/var/log/telemetry/log-collector.log 2>&1 </dev/null &
      echo "$!" > "$PIDDIR/log-collector.pid"
      ;;
    *)
      echo "svc-ctl: unknown service '$1'" >&2
      return 1
      ;;
  esac
}

stop_one() {
  f="$PIDDIR/$1.pid"
  if [ -f "$f" ]; then
    kill -9 "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  fi
}

case "${1:-}" in
  start)
    if [ -n "${2:-}" ]; then
      start_one "$2"
    else
      for s in $SERVICES; do start_one "$s"; done
    fi
    ;;
  stop)
    if [ -n "${2:-}" ]; then
      stop_one "$2"
    else
      for s in $SERVICES; do stop_one "$s"; done
    fi
    ;;
  restart)
    "$0" stop "${2:-}"
    sleep 1
    "$0" start "${2:-}"
    ;;
  *)
    echo "usage: svc-ctl {start|stop|restart} [service]" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/svc-ctl
