#!/bin/sh
# Runs at build time as root.
#
# Break, two layers deep on purpose:
# 1. worker2 crashes instantly on every start because it can't read its
#    config file (a real, fixable bug).
# 2. Restart=always + a tight StartLimitBurst means systemd gives up after a
#    few rapid failures and marks the unit "start-limit-hit" -- at that point
#    even a correct underlying fix is not enough on its own: systemd will
#    refuse to start the unit again ("start request repeated too quickly")
#    until the failure counter is explicitly cleared with
#    `systemctl reset-failed`. Both steps are required, in order.
set -eu

mkdir -p /etc/worker2
# The config file is deliberately absent -- that's the crash cause.

cat > /usr/local/bin/worker2 <<'EOF'
#!/bin/sh
if [ ! -f /etc/worker2/worker2.conf ]; then
  echo "FATAL: missing /etc/worker2/worker2.conf" >&2
  exit 1
fi
. /etc/worker2/worker2.conf
echo "worker2: started (queue=$QUEUE_NAME)"
exec sleep infinity
EOF
chmod +x /usr/local/bin/worker2

cat > /etc/systemd/system/worker2.service <<'EOF'
[Unit]
Description=Background worker
After=network.target
StartLimitIntervalSec=20
StartLimitBurst=3

[Service]
ExecStart=/usr/local/bin/worker2
Restart=always
RestartSec=1

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/worker2.service /etc/systemd/system/multi-user.target.wants/worker2.service
