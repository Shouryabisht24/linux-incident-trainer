#!/bin/sh
# Solved when a new file can actually be created in the spool (inodes available).
set -u
PROBE=/var/spool/ingest/.check_probe
if ( : > "$PROBE" ) 2>/dev/null; then
  rm -f "$PROBE" 2>/dev/null
  echo "new files can be created in /var/spool/ingest again"
  exit 0
fi
echo "still cannot create files in /var/spool/ingest (inodes exhausted?)"
exit 1
