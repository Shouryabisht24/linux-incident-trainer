#!/bin/sh
# Break: /srv/app/current is a dangling symlink pointing at a release directory
# that was never fully unpacked (does not exist). A previous good release does
# exist and the trainee must repoint 'current' at it.
set -eu
mkdir -p /srv/app/releases
mkdir -p /srv/app/releases/20240120-1200
printf '<html><body>APP_OK release 20240120-1200</body></html>\n' > /srv/app/releases/20240120-1200/index.html
# The interrupted deploy left 'current' pointing at a dir that doesn't exist.
ln -sfn /srv/app/releases/20240121-0300-partial /srv/app/current
