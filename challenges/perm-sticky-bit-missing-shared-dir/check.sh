#!/bin/sh
# Solved when a file owned by "batchjob" in the shared dir can no longer be
# removed by the UNRELATED unprivileged user "otherjob" -- i.e. the sticky bit
# is actually protecting it. This is a real functional test with two ordinary
# users, not a check of root's view (root can always unlink regardless).
set -u
PROBE=/srv/shared/dropbox/handoff_$$.txt

sudo -u batchjob sh -c "echo data > '$PROBE'" 2>/dev/null
if [ ! -f "$PROBE" ]; then
  echo "setup failed: could not create probe file as batchjob"
  exit 1
fi

if sudo -u otherjob rm -f "$PROBE" 2>/dev/null; then
  echo "otherjob was able to delete batchjob's file -- sticky bit still missing"
  rm -f "$PROBE" 2>/dev/null
  exit 1
fi

echo "otherjob could not delete batchjob's file -- sticky bit is protecting the shared dir"
rm -f "$PROBE" 2>/dev/null
exit 0
