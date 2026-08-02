#!/bin/sh
# Solved when the UNPRIVILEGED "etl" user can actually read the export file
# and see real content (proves the ACL deny is gone/overridden, not just that
# root can read it -- root could always read it regardless).
set -u
OUT=$(sudo -u etl cat /var/data/exports/customer_export.csv 2>/dev/null)
if echo "$OUT" | grep -q "EXPORT_MARKER_OK"; then
  echo "etl can read the export file"
  exit 0
fi
echo "etl still cannot read the export file"
exit 1
