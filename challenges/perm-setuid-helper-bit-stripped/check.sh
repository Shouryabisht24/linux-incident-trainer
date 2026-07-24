#!/bin/sh
# Solved when the UNPRIVILEGED "auditor" user can successfully run the helper
# and it actually reads the protected log (proves the setuid bit is doing its
# job, not just that root can read the file -- root could always read it).
set -u
OUT=$(sudo -u auditor /usr/local/bin/read-audit-log 2>/dev/null)
if echo "$OUT" | grep -q "AUDIT_MARKER_OK"; then
  echo "auditor can read the audit log via the helper"
  exit 0
fi
echo "auditor still cannot read the audit log via the helper"
exit 1
