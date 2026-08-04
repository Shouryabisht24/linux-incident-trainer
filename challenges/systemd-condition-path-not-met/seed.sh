#!/bin/sh
# Runs at build time as root.
#
# Break: metrics-agent.service has ConditionPathExists=/etc/metrics-agent/enabled
# in its [Unit] section -- a real, common pattern for gating whether a service
# should run on a given host via a flag file dropped by config management
# during provisioning. That flag file was never created on this host (the
# provisioning step that's supposed to drop it was skipped), so the condition
# silently fails on every attempt to start the unit -- at boot and on a manual
# `systemctl start` alike. A failed Condition is NOT the same as a failed
# unit: systemd treats it as "nothing to do here", reports success, and the
# unit just sits `inactive` forever -- distinct from `systemd-masked-service`
# (an explicit admin mask, `systemctl status` clearly says `masked`) by being
# condition-based and much subtler: status here says "condition failed", not
# "failed" or "masked".
set -eu

mkdir -p /var/lib/metrics-agent

cat > /usr/local/bin/metrics-agent <<'EOF'
#!/bin/sh
while true; do
  date -Is > /var/lib/metrics-agent/heartbeat
  sleep 2
done
EOF
chmod +x /usr/local/bin/metrics-agent

cat > /etc/systemd/system/metrics-agent.service <<'EOF'
[Unit]
Description=Host metrics shipping agent
ConditionPathExists=/etc/metrics-agent/enabled
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/metrics-agent
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/metrics-agent.service /etc/systemd/system/multi-user.target.wants/metrics-agent.service

# Deliberately NOT creating /etc/metrics-agent/ or /etc/metrics-agent/enabled --
# that's the entire break.
