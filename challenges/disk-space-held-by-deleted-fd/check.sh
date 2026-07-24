#!/bin/sh
# Solved when /var/log/streamer actually has real free space back -- not just
# when the directory listing looks empty (it already does, before AND after,
# since the offending file was unlinked from the start; the space itself is
# what's still held hostage by the process's open file descriptor).
set -u
AVAIL=$(df -m --output=avail /var/log/streamer 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0
if [ "$AVAIL" -ge 16 ]; then
  echo "/var/log/streamer has ${AVAIL}MB free"
  exit 0
fi
echo "/var/log/streamer is still nearly full (${AVAIL}MB free) even though it looks empty"
exit 1
