#!/bin/sh
# Runs at build time as root.
#
# Break: cleanup.timer's OnCalendar= value uses plain-English syntax
# ("daily at 3am") instead of systemd's actual calendar-event grammar, so
# systemd can't parse it at all -- the timer fails to activate with
# "Failed to start cleanup.timer: Invalid argument", and the nightly cleanup
# job it's supposed to trigger never runs.
set -eu

mkdir -p /var/lib/app

cat > /usr/local/bin/cleanup-tmp <<'EOF'
#!/bin/sh
date -Is > /var/lib/app/last-cleanup
EOF
chmod +x /usr/local/bin/cleanup-tmp

cat > /etc/systemd/system/cleanup.service <<'EOF'
[Unit]
Description=Nightly cleanup job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/cleanup-tmp
EOF

cat > /etc/systemd/system/cleanup.timer <<'EOF'
[Unit]
Description=Run cleanup nightly

[Timer]
OnCalendar=daily at 3am
Persistent=true

[Install]
WantedBy=timers.target
EOF

mkdir -p /etc/systemd/system/timers.target.wants
ln -sf /etc/systemd/system/cleanup.timer /etc/systemd/system/timers.target.wants/cleanup.timer
