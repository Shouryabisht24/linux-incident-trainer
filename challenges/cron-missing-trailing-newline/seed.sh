#!/bin/sh
# Runs at build time as root.
#
# Break: /etc/cron.d/nightly-sync was edited by a tool (or a copy-paste)
# that didn't leave a trailing newline after its one job line. cron treats a
# crontab file's final line as invalid and silently drops it entirely if
# it isn't newline-terminated -- there's no error surfaced anywhere obvious,
# the job just never runs, forever, exactly as if it had never been added.
set -eu

# printf, deliberately with no trailing \n, to reproduce the exact bug.
printf '*/5 * * * * root /usr/local/bin/nightly-sync.sh' > /etc/cron.d/nightly-sync
chmod 644 /etc/cron.d/nightly-sync

cat > /usr/local/bin/nightly-sync.sh <<'EOF'
#!/bin/sh
date -Is > /var/log/nightly-sync.done
EOF
chmod +x /usr/local/bin/nightly-sync.sh
