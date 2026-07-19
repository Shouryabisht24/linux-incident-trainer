#!/bin/sh
# Run once at image build time (as root) to bake the break into the image.
#
# nginx's MASTER process runs as root and binds port 80 fine regardless of
# file permissions (root bypasses DAC checks) - so breaking nginx.conf's
# permissions doesn't actually block anything once nginx is started via
# `sudo service nginx start`. The real, unprivileged actor is nginx's WORKER
# process, which drops to the "www-data" user and genuinely can't read files
# it doesn't have permission to - that's the break we use here.
set -eu

chown -R root:root /var/www/html
chmod 700 /var/www/html
chmod 600 /var/www/html/index.nginx-debian.html

# nginx is intentionally left stopped - the trainee must diagnose and start it.
