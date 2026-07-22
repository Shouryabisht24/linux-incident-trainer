#!/bin/sh
# Solved when /srv/app/current resolves to a real release whose index.html is
# present and healthy.
set -u
if [ ! -e /srv/app/current/index.html ]; then
  echo "/srv/app/current/index.html does not resolve (dangling symlink?)"
  exit 1
fi
if grep -q "APP_OK" /srv/app/current/index.html 2>/dev/null; then
  echo "/srv/app/current points at a healthy release"
  exit 0
fi
echo "/srv/app/current resolves but the page is not the healthy release"
exit 1
