#!/bin/sh
# Runs at build time as root.
#
# Break: the billing app was renamed (its log file used to be app.log, now
# it's billing.log), but the logrotate config for it was never updated to
# match. logrotate's own `missingok` directive means it just silently does
# nothing when the path it's configured for doesn't exist -- no error, no
# warning, rotation just quietly never happens for the real, ever-growing
# log file.
set -eu

mkdir -p /var/log/billing
# Simulate an already-substantial log that should have been rotated by now.
for i in $(seq 1 200); do
  echo "2026-07-$((i % 28 + 1))T00:00:00Z billing: processed invoice $i" >> /var/log/billing/billing.log
done

cat > /etc/logrotate.d/billing <<'EOF'
/var/log/billing/app.log {
    daily
    rotate 7
    missingok
    notifempty
    copytruncate
}
EOF
