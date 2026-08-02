#!/bin/sh
# Solved when a file freshly created by dataexport (simulating a real export
# job, with the same restrictive umask the real job uses) is immediately
# readable by analyst. Uses a fresh probe file each run so this is safe to
# call repeatedly -- it never relies on a pre-existing file's ownership.
set -u
PROBE="/srv/exports/.check_probe_$$"

sudo -u dataexport sh -c "umask 027; touch '$PROBE'" 2>/dev/null
if sudo -u analyst test -r "$PROBE" 2>/dev/null; then
  rm -f "$PROBE" 2>/dev/null
  echo "analyst can read files dataexport creates"
  exit 0
fi
rm -f "$PROBE" 2>/dev/null
echo "analyst still cannot read files dataexport creates"
exit 1
