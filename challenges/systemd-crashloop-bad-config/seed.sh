#!/bin/sh
# Break: webapp.conf sets LISTEN_PORT to a non-numeric value, so the app exits 1
# on startup; with Restart=always systemd crash-loops it. Root cause is in the
# config, discoverable via `journalctl -u webapp` (the app prints why it died).
set -eu
mkdir -p /etc/webapp
cat > /usr/local/bin/webapp <<'EOF'
#!/bin/sh
. /etc/webapp/webapp.conf 2>/dev/null || { echo "FATAL: cannot read /etc/webapp/webapp.conf"; exit 1; }
if [ -z "${LISTEN_PORT:-}" ] || ! echo "$LISTEN_PORT" | grep -qE '^[0-9]+$'; then
  echo "FATAL: LISTEN_PORT must be a number, got: '${LISTEN_PORT:-}'"
  exit 1
fi
echo "webapp: listening on port $LISTEN_PORT"
exec sleep infinity
EOF
chmod +x /usr/local/bin/webapp

# The bad value that causes the crash loop:
echo "LISTEN_PORT=eighty" > /etc/webapp/webapp.conf

cat > /etc/systemd/system/webapp.service <<'EOF'
[Unit]
Description=Demo webapp
After=network.target

[Service]
ExecStart=/usr/local/bin/webapp
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# Enable offline (no running systemd at build time) by creating the wants symlink.
mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/webapp.service /etc/systemd/system/multi-user.target.wants/webapp.service
