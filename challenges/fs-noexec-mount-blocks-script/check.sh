#!/bin/sh
# Solved when the real, stable entry point (/usr/local/bin/run-migration) can
# actually run the migration end to end and produce its marker file. Removes
# any stale marker first so a pass here means it genuinely ran just now.
set -u
rm -f /var/lib/app/migration.done
OUT=$(/usr/local/bin/run-migration 2>&1)
if [ -f /var/lib/app/migration.done ]; then
  echo "migration ran successfully"
  exit 0
fi
echo "migration still fails to run:"
echo "$OUT"
exit 1
