#!/bin/sh
# Build time. Just installs the "streamer" daemon script; it does its actual
# work (filling then unlinking its log against the tmpfs) at container start,
# from the Dockerfile CMD -- see the comment there for why.
set -eu

cat > /usr/local/bin/streamer <<'EOF'
#!/bin/sh
# A small telemetry forwarder. It opens its log file and keeps the file
# descriptor for as long as it runs. Simulates a real, very common incident:
# a log-rotation step deleted the file out from under a still-running
# process instead of signalling it to reopen (no `copytruncate`, no HUP/USR1
# handling) -- the process keeps writing through its now-unlinked file
# descriptor, and the kernel can't reclaim those blocks until that last
# reference closes, even though the file no longer appears anywhere in the
# directory listing.
LOG=/var/log/streamer/streamer.log
mkdir -p /var/log/streamer

# Fill most of the bounded tmpfs up front (deterministic size, not a
# fill-to-ENOSPC loop).
dd if=/dev/zero of="$LOG" bs=1M count=20 2>/dev/null

# Keep a file descriptor open on it...
exec 3>>"$LOG"
# ...then "rotate" it the broken way: unlink while still held open.
rm -f "$LOG"

# Stay alive holding fd 3 open, still doing periodic "work".
while true; do
  sleep 5
done
EOF
chmod +x /usr/local/bin/streamer
