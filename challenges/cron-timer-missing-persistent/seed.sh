#!/bin/sh
# Runs at build time as root.
#
# Break: nightly-reconcile.timer's [Timer] section has no Persistent=true, so
# after it was disabled for a maintenance freeze and then re-enabled, none of
# the daily 02:00 occurrences it missed while inactive are ever made up --
# systemd just resumes waiting for the *next* natural one. The timer itself
# is never symlinked into timers.target.wants here, so it stays genuinely
# disabled/inactive at container boot, exactly like a service someone forgot
# to re-enable after maintenance.
#
# To make the "it used to run, then went quiet for three days" backstory
# real rather than just a comment, we forge systemd's own persisted
# last-trigger record for this timer: /var/lib/systemd/timers/stamp-<unit>
# is an empty marker file whose *mtime* systemd reads as "when this timer
# last fired" for any timer with Persistent=true. Backdating it three days
# means there are genuinely-missed 02:00 occurrences for systemd to detect
# and catch up on -- but only once Persistent=true actually exists in the
# unit and the timer is (re-)activated.
set -eu

mkdir -p /var/lib/app

cat > /usr/local/bin/nightly-reconcile <<'EOF'
#!/bin/sh
date -Is > /var/lib/app/last-reconcile
EOF
chmod +x /usr/local/bin/nightly-reconcile

cat > /etc/systemd/system/nightly-reconcile.service <<'EOF'
[Unit]
Description=Nightly reconciliation job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nightly-reconcile
EOF

cat > /etc/systemd/system/nightly-reconcile.timer <<'EOF'
[Unit]
Description=Run nightly reconciliation

[Timer]
OnCalendar=*-*-* 02:00:00
Unit=nightly-reconcile.service

[Install]
WantedBy=timers.target
EOF

mkdir -p /var/lib/systemd/timers
touch -d "3 days ago" /var/lib/systemd/timers/stamp-nightly-reconcile.timer
