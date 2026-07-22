#!/bin/sh
# Solved when the deploy user can create a file in /srv/app. Uses `sudo -u -i`
# so a fresh login session picks up updated group membership.
set -u
if sudo -u deploy sh -c 'touch /srv/app/deploy_probe && rm -f /srv/app/deploy_probe' 2>/dev/null; then
  echo "deploy user can write to /srv/app"
  exit 0
fi
echo "deploy user still cannot write to /srv/app"
exit 1
