#!/bin/sh
# Runs at build time as root.
#
# Break: a backend app was migrated to a versioned unix-socket filename
# (app-v2.sock) as part of a rollout, but the public-facing nginx reverse
# proxy's config still points proxy_pass at the old socket name (app.sock).
# The backend itself is healthy and listening -- just not where the proxy
# is looking -- so nginx answers every request with 502 Bad Gateway.
set -eu
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf <<'EOF'
# backend app (healthy) -- listens on a unix socket
server {
    listen unix:/run/backend/app-v2.sock;
    location / { return 200 "backend ok\n"; }
}
# public reverse proxy on 8080
server {
    listen 8080;
    location / {
        proxy_pass http://unix:/run/backend/app.sock:;   # WRONG: backend moved to app-v2.sock
    }
}
EOF
