#!/bin/sh
# Runs at build time as root.
#
# Break: during a redeploy someone pinned the app's nginx config to a specific
# loopback alias (127.0.0.2) instead of leaving it on all interfaces / the
# default loopback address (127.0.0.1). The service is healthy and definitely
# listening on 8080 -- just on the wrong local address. Every client, health
# check, and monitoring probe hits 127.0.0.1 (via "localhost"), which nothing
# is bound to, so they all see connection refused.
set -eu
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf <<'EOF'
server {
    listen 127.0.0.2:8080;
    location / { return 200 "web ok\n"; }
}
EOF
