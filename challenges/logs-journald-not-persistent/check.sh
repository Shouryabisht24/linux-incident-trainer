#!/bin/sh
# Solved when journald is actually persisting to /var/log/journal (a journal
# file exists there).
set -u
if [ -d /var/log/journal ] && find /var/log/journal -name '*.journal' 2>/dev/null | grep -q .; then
  echo "journald is persisting logs under /var/log/journal"
  exit 0
fi
echo "no persistent journal files under /var/log/journal yet"
exit 1
