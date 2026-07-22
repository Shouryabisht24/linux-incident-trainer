#!/bin/sh
# Break: /srv/app is group-writable by group "appteam" (mode 2770), but the
# "deploy" user isn't a member of appteam, so it can't write.
set -eu
groupadd appteam
useradd -m -s /bin/bash deploy
mkdir -p /srv/app
chown root:appteam /srv/app
chmod 2770 /srv/app
