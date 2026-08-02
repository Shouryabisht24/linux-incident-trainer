#!/bin/sh
# Solved when the cache filesystem has healthy free space back AND the
# thumbnailer can actually write a new thumbnail into it (proves the cache is
# usable again, not just that df looks fine).
set -u

CACHE=/var/cache/photoapp/thumbnails
AVAIL=$(df -m --output=avail "$CACHE" 2>/dev/null | tail -1 | tr -d ' ')
[ -z "$AVAIL" ] && AVAIL=0

if [ "$AVAIL" -lt 8 ]; then
  echo "$CACHE is still nearly full (${AVAIL}MB free)"
  exit 1
fi

if ! /usr/local/bin/photoapp-thumbnailer generate checkprobe >/dev/null 2>&1; then
  echo "photoapp-thumbnailer still cannot write a new thumbnail into $CACHE"
  exit 1
fi
rm -f "$CACHE/thumb-checkprobe.jpg" 2>/dev/null

echo "$CACHE has ${AVAIL}MB free and thumbnail generation works again"
exit 0
