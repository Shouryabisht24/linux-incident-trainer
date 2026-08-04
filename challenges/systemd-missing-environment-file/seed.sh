#!/bin/sh
# Runs at build time as root.
#
# Break: billing-worker.service's EnvironmentFile= uses the "-" optional
# prefix (EnvironmentFile=-/etc/billing-worker/billing-worker.env). That
# prefix tells systemd not to complain if the file is missing -- so the unit
# loads and starts with zero errors reported by systemd itself. The file was
# simply never deployed to this host (a secrets/config-management pipeline
# step that never ran), so BILLING_API_KEY is never set in the environment,
# and the app's own very first startup check fails immediately. This is
# deliberately distinct from systemd-bad-execstart-path: the binary path is
# completely correct here, it's the *environment* the binary needs that's
# missing. Deliberately NOT creating /etc/billing-worker/ at all is the
# entire break.
set -eu

cat > /usr/local/bin/billing-worker <<'EOF'
#!/bin/sh
if [ -z "${BILLING_API_KEY:-}" ]; then
  echo "FATAL: BILLING_API_KEY is not set -- check EnvironmentFile" >&2
  exit 1
fi
echo "billing-worker: starting with key ${BILLING_API_KEY}"
exec sleep infinity
EOF
chmod +x /usr/local/bin/billing-worker

cat > /etc/systemd/system/billing-worker.service <<'EOF'
[Unit]
Description=Billing worker
After=network.target

[Service]
Type=simple
EnvironmentFile=-/etc/billing-worker/billing-worker.env
ExecStart=/usr/local/bin/billing-worker
Restart=no

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/billing-worker.service /etc/systemd/system/multi-user.target.wants/billing-worker.service

# Deliberately NOT creating /etc/billing-worker/ or the .env file -- that's
# the entire break.
