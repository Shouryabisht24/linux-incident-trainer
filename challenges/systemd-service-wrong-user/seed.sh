#!/bin/sh
# Runs at build time as root.
#
# Break: the service account was renamed from "reportgen" to "reportsvc"
# during a security review (shorter-lived, more tightly scoped account name),
# but the unit file's `User=` directive was never updated to match. systemd
# fails to even launch the process: `systemctl status reportd` shows
# `status=217/USER` -- it can't resolve the configured user at all, so this
# never gets as far as running the actual program.
set -eu

useradd -r -s /usr/sbin/nologin reportsvc

cat > /usr/local/bin/reportd <<'EOF'
#!/bin/sh
echo "reportd: running as $(whoami)"
exec sleep infinity
EOF
chmod +x /usr/local/bin/reportd

cat > /etc/systemd/system/reportd.service <<'EOF'
[Unit]
Description=Report generator daemon
After=network.target

[Service]
User=reportgen
ExecStart=/usr/local/bin/reportd
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/reportd.service /etc/systemd/system/multi-user.target.wants/reportd.service
