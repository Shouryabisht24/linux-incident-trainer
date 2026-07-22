#!/bin/sh
# Break: nginx is healthy but configured to listen on 9090, not the 8080 that
# clients/monitoring expect -> "connection refused" on 8080.
set -eu
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf <<'EOF'
server {
    listen 9090;
    location / { return 200 "web ok\n"; }
}
EOF
