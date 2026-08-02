#!/bin/sh
# Runs at build time as root. Sets up a SysV-style service, "renderd":
# - /etc/init.d/renderd is a real init script (LSB header, start/stop/status)
#   invoked the normal Debian way via `service renderd <action>` -- no
#   systemd required (this box doesn't run systemd as PID 1).
# - On "start", it runs a startup self-test: it actually invokes the render
#   helper once before considering itself up, and REFUSES to start (exits
#   non-zero, leaves no pidfile) if that helper fails. This mirrors a very
#   real pattern -- services with an internal helper/plugin they shell out
#   to as part of startup, which fail closed rather than silently limping up
#   broken.
# - The helper's path is a single config value in /etc/default/renderd,
#   sourced by both the init script and the resident daemon loop -- the
#   normal Debian "one place to point at the right binary" convention.
# - The break: /opt/render-assets (where challenge.json mounts a noexec
#   tmpfs) is where the helper actually lives. `ls -l` on it shows a normal
#   0755, executable script -- nothing looks wrong there. But `noexec` is a
#   MOUNT-level restriction: the kernel refuses to execve() ANYTHING on that
#   filesystem, regardless of the file's own permission bits, and this is
#   NOT bypassed by root either (unlike ordinary DAC permission checks) --
#   see AUTHORING.md and decisions/0007's execute-bit exception. That's why
#   renderd's own self-test -- which runs as part of `service renderd start`,
#   invoked here via sudo/root -- genuinely fails, not just for an
#   unprivileged process.
#
# NOTE: /opt/render-assets is an empty tmpfs at container start (per
# challenge.json), so the helper script itself is written there by the
# Dockerfile's CMD at runtime, not here -- there's nothing meaningful to
# bake into the image for it ahead of time.
set -eu

mkdir -p /var/log/renderd /var/lib/renderd
: > /var/log/renderd/renderd.log

cat > /etc/default/renderd <<'EOF'
# Configuration for the renderd service. Sourced by /etc/init.d/renderd and
# by /usr/local/bin/renderd-daemon.sh -- change this one value to repoint
# renderd at a different helper location.
HELPER_PATH=/opt/render-assets/render-helper.sh
EOF

cat > /usr/local/bin/renderd-daemon.sh <<'EOF'
#!/bin/sh
# Resident loop: periodically re-runs the render helper once the service is
# considered started. Not exercised directly by check.sh -- the pass/fail
# signal is whether the service actually STARTS, via the startup self-test
# in /etc/init.d/renderd below.
. /etc/default/renderd
while true; do
  "$HELPER_PATH" >> /var/log/renderd/renderd.log 2>&1
  sleep 5
done
EOF
chmod +x /usr/local/bin/renderd-daemon.sh

cat > /etc/init.d/renderd <<'EOF'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          renderd
# Required-Start:    $local_fs
# Required-Stop:     $local_fs
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Invoice render daemon
### END INIT INFO
. /etc/default/renderd

PIDFILE=/var/run/renderd.pid
LOG=/var/log/renderd/renderd.log

case "$1" in
  start)
    echo "$(date -Iseconds) starting renderd, running startup self-test via $HELPER_PATH..." >> "$LOG"
    if "$HELPER_PATH" >> "$LOG" 2>&1; then
      setsid /usr/local/bin/renderd-daemon.sh </dev/null >>"$LOG" 2>&1 &
      echo $! > "$PIDFILE"
      echo "renderd started"
      exit 0
    else
      echo "renderd: startup self-test failed, refusing to start (see $LOG)" >&2
      rm -f "$PIDFILE"
      exit 1
    fi
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then
      kill "$(cat "$PIDFILE")" 2>/dev/null || true
      rm -f "$PIDFILE"
    fi
    echo "renderd stopped"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "renderd is running"
      exit 0
    else
      echo "renderd is not running"
      exit 1
    fi
    ;;
  *)
    echo "Usage: service renderd {start|stop|status}"
    exit 1
    ;;
esac
EOF
chmod +x /etc/init.d/renderd
