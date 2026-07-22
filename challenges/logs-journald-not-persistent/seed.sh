#!/bin/sh
# Break: journald is using volatile storage (logs in /run, lost on reboot).
# There is no /var/log/journal directory, and storage is pinned to volatile.
set -eu
rm -rf /var/log/journal
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/volatile.conf <<'EOF'
[Journal]
Storage=volatile
EOF
