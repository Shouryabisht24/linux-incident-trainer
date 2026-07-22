#!/bin/sh
# The backend listens on 127.0.0.1:3001. The front proxy forwards to
# 127.0.0.1:3000 (wrong) -> nginx can't connect upstream -> 502 Bad Gateway.
set -eu
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/proxy.conf <<'EOF'
# backend app (healthy) - listens on 3001
server {
    listen 127.0.0.1:3001;
    location / { return 200 "backend ok\n"; }
}
# public reverse proxy on 8080
server {
    listen 8080;
    location / {
        proxy_pass http://127.0.0.1:3000;   # WRONG: backend is on 3001
    }
}
EOF
