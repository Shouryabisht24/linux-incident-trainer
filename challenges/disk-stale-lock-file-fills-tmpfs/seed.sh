#!/bin/sh
# Runs at build time as root.
#
# Break: eventqueue's start logic reserves a fixed-size WAL segment
# (wal.reserved) up front so it never has to fail mid-write; brokerctl treats
# the mere *presence* of that reservation file, combined with low free space,
# as evidence another instance already owns it, and refuses to start rather
# than risk clobbering a live broker. That's a reasonable safety check -- but
# after an ungraceful shutdown (this box lost power), the reservation file is
# left behind with nothing actually holding it, so the check fires forever on
# a false positive. The tmpfs at /var/lib/eventqueue is empty at container
# start, so the actual stale file is written in the Dockerfile CMD, not here.
set -eu

mkdir -p /var/lib/eventqueue

cat > /usr/local/bin/eventqueue-worker <<'EOF'
#!/bin/sh
# Long-running broker process; keeps a recognizable argv for pgrep.
while true; do
  sleep 30
done
EOF
chmod +x /usr/local/bin/eventqueue-worker

cat > /usr/local/bin/brokerctl <<'EOF'
#!/bin/sh
set -u
SPOOL=/var/lib/eventqueue
RESERVE="$SPOOL/wal.reserved"
MIN_FREE_MB=6

case "${1:-}" in
  start)
    AVAIL=$(df -m --output=avail "$SPOOL" 2>/dev/null | tail -1 | tr -d ' ')
    [ -z "$AVAIL" ] && AVAIL=0
    if [ -f "$RESERVE" ] && [ "$AVAIL" -lt "$MIN_FREE_MB" ]; then
      echo "brokerctl: refusing to start -- only ${AVAIL}MB free in $SPOOL and a WAL reservation ($RESERVE) is already present; assuming another instance is still using it"
      exit 1
    fi
    # Claim (or reclaim) this instance's own WAL reservation, then start.
    dd if=/dev/zero of="$RESERVE" bs=1M count=13 2>/dev/null
    setsid /usr/local/bin/eventqueue-worker </dev/null >/dev/null 2>&1 &
    echo $! > /tmp/eventqueue.pid
    echo "eventqueue broker started (pid $(cat /tmp/eventqueue.pid))"
    ;;
  *)
    echo "usage: brokerctl start" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/brokerctl
