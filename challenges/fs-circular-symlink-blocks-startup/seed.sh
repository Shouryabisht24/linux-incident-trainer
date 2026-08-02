#!/bin/sh
# Runs at build time as root.
#
# Break: /etc/webapp/conf.active is supposed to be a symlink pointing at the
# real active profile directory (/etc/webapp/profiles/prod). A broken deploy
# script instead ran the equivalent of `ln -sfn conf.active conf.active` from
# inside /etc/webapp, creating a symlink whose target is itself -- a
# self-referential loop. Any attempt to open a file through it fails with
# ELOOP ("Too many levels of symbolic links"), which is a real kernel-level
# filesystem error, not a permissions problem, and is enforced identically
# for root and unprivileged processes alike.
set -eu

mkdir -p /etc/webapp/profiles/prod
cat > /etc/webapp/profiles/prod/app.conf <<'EOF'
LISTEN_PORT=8080
LOG_LEVEL=info
EOF

# The good profile is intact; only the "active" pointer is broken.
ln -sfn conf.active /etc/webapp/conf.active

cat > /usr/local/bin/webapp-worker <<'EOF'
#!/bin/sh
# Long-running worker; keeps the listen port in its argv so it's identifiable
# via pgrep/ps.
PORT="${1:-unknown}"
while true; do
  sleep 30
done
EOF
chmod +x /usr/local/bin/webapp-worker

cat > /usr/local/bin/webappctl <<'EOF'
#!/bin/bash
set -u
CONF=/etc/webapp/conf.active/app.conf

case "${1:-}" in
  start)
    if ! content=$(cat "$CONF" 2>&1); then
      echo "webapp: failed to read config at $CONF: $content" >&2
      exit 1
    fi
    PORT=$(printf '%s\n' "$content" | sed -n 's/^LISTEN_PORT=//p' | tr -d '\r')
    if [ -z "$PORT" ]; then
      echo "webapp: could not determine LISTEN_PORT from $CONF" >&2
      exit 1
    fi
    setsid /usr/local/bin/webapp-worker "$PORT" </dev/null >/dev/null 2>&1 &
    echo $! > /tmp/webapp.pid
    echo "webapp started on port $PORT (pid $(cat /tmp/webapp.pid))"
    ;;
  *)
    echo "usage: webappctl start" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/webappctl
