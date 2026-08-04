#!/bin/sh
# Runs at build time as root.
#
# Break: webapp.service has no After=/Requires= on data-init.service, the
# oneshot unit that prepares /var/lib/app/ready. Both units are pulled in by
# multi-user.target and, absent explicit ordering, systemd is free to start
# them in parallel on boot. data-init.service takes a couple of seconds to
# actually finish (simulating real provisioning work); webapp checks for its
# ready marker the instant it's invoked and, finding it missing, exits
# immediately. Restart=no means it just sits "failed" -- it never retries
# into success on its own.
#
# The insidious part: a manual `systemctl restart webapp` run any time after
# those first couple of seconds "fixes" it trivially, because data-init has
# long since finished by then. That's exactly the misleading symptom this
# challenge is built around -- the unit's ordering is still wrong, it just
# isn't being exercised by a system that's already past the boot race window.
set -eu

mkdir -p /var/lib/app

cat > /usr/local/bin/data-init.sh <<'EOF'
#!/bin/sh
sleep 2
mkdir -p /var/lib/app
touch /var/lib/app/ready
EOF
chmod +x /usr/local/bin/data-init.sh

cat > /usr/local/bin/webapp <<'EOF'
#!/bin/sh
if [ ! -f /var/lib/app/ready ]; then
  echo "FATAL: /var/lib/app/ready missing -- data-init hasn't completed yet" >&2
  exit 1
fi
echo "webapp: data ready, serving"
exec sleep infinity
EOF
chmod +x /usr/local/bin/webapp

cat > /etc/systemd/system/data-init.service <<'EOF'
[Unit]
Description=Prepares local app data directory

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/data-init.sh

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/webapp.service <<'EOF'
[Unit]
Description=webapp
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/webapp
Restart=no

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/data-init.service /etc/systemd/system/multi-user.target.wants/data-init.service
ln -sf /etc/systemd/system/webapp.service /etc/systemd/system/multi-user.target.wants/webapp.service
