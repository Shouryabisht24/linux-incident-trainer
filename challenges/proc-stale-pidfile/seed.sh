#!/bin/sh
# Break: a stale PID file left behind by an unclean shutdown. The (naive) control
# script only checks that the pidfile EXISTS, not that the PID is alive, so it
# refuses to start forever until the stale file is removed.
set -eu
cat > /usr/local/bin/queue-worker <<'EOF'
#!/bin/sh
# long-running worker (keeps its own argv so it's identifiable in ps/pgrep)
while true; do
  sleep 30
done
EOF
chmod +x /usr/local/bin/queue-worker

cat > /usr/local/bin/queue-workerctl <<'EOF'
#!/bin/sh
PIDFILE=/var/run/queue-worker.pid
case "$1" in
  start)
    if [ -f "$PIDFILE" ]; then
      echo "queue-worker already running (pid $(cat "$PIDFILE")); refusing to start"
      exit 1
    fi
    setsid /usr/local/bin/queue-worker >/dev/null 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    echo "started queue-worker (pid $(cat "$PIDFILE"))"
    ;;
  *) echo "usage: queue-workerctl start"; exit 2 ;;
esac
EOF
chmod +x /usr/local/bin/queue-workerctl

# Stale pidfile pointing at a PID that isn't running (unclean shutdown).
echo "31337" > /var/run/queue-worker.pid
