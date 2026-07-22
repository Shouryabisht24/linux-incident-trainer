#!/bin/sh
# The API service is healthy and listens on 127.0.0.1:8080. The break (a bad
# /etc/hosts entry) is applied at container start, because /etc/hosts is
# read-only during `docker build` and edits there don't persist into the image.
set -eu
cat > /etc/nginx/conf.d/api.conf <<'EOF'
server {
    listen 127.0.0.1:8080;
    server_name api.internal;
    location / { return 200 "api ok\n"; }
}
EOF
rm -f /etc/nginx/sites-enabled/default
