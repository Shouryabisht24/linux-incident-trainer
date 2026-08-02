#!/bin/sh
# Solved when the backupsvc account can actually start a session again.
set -u
OUT=$(su - backupsvc -c 'echo BACKUP_OK' 2>/dev/null)
if [ "$OUT" = "BACKUP_OK" ]; then
  echo "backupsvc account is usable again"
  exit 0
fi
echo "backupsvc account is still blocked by a forced password change"
exit 1
