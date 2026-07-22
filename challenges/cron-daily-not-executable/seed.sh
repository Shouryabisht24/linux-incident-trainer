#!/bin/sh
# Break: the cron.daily backup script is NOT executable. run-parts (which cron
# uses to run /etc/cron.daily) silently skips files that aren't executable, so
# the job never runs even though the script itself is fine.
set -eu
# Clear Debian's default cron.daily scripts so run-parts only touches ours.
rm -f /etc/cron.daily/*
mkdir -p /srv/appdata /var/backups
echo "important data" > /srv/appdata/data.txt

cat > /etc/cron.daily/backup <<'EOF'
#!/bin/sh
tar -cf /var/backups/app-backup.tar -C /srv/appdata . 2>/dev/null
EOF
# The bug: mode 644, missing the execute bit run-parts requires.
chmod 644 /etc/cron.daily/backup
