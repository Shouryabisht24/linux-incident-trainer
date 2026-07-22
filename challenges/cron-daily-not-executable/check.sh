#!/bin/sh
# Solved when the daily runner actually executes the backup and produces output.
set -u
rm -f /var/backups/app-backup.tar
run-parts /etc/cron.daily >/dev/null 2>&1
if [ -f /var/backups/app-backup.tar ]; then
  echo "run-parts executed the backup job (/var/backups/app-backup.tar produced)"
  exit 0
fi
echo "run-parts did not execute the backup job (script not executable?)"
exit 1
