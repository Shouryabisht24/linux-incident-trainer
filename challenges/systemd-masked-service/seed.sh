#!/bin/sh
# Break: nginx.service is masked (symlinked to /dev/null), so `systemctl start`
# fails with "Unit nginx.service is masked." until it's unmasked.
set -eu
ln -sf /dev/null /etc/systemd/system/nginx.service
