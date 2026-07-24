#!/bin/sh
# Runs at build time as root.
#
# The site's TLS certificate expired -- nobody rotated it before it ran out.
# nginx itself doesn't validate certificate expiry at startup, so it starts
# and serves TLS just fine; only a real handshake/inspection reveals the
# certificate is no longer valid. `faketime` is used here purely to backdate
# the *generation* of the certificate so it's already expired by the time the
# challenge is built and run -- it's a build-time trick to plant the break,
# not something the trainee needs.
set -eu

mkdir -p /etc/nginx/ssl

faketime '2020-01-01 00:00:00' \
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout /etc/nginx/ssl/site.key -out /etc/nginx/ssl/site.crt \
    -subj '/CN=app.internal' >/dev/null 2>&1

rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/tls-app.conf <<'EOF'
server {
    listen 8443 ssl;
    server_name app.internal;
    ssl_certificate     /etc/nginx/ssl/site.crt;
    ssl_certificate_key /etc/nginx/ssl/site.key;
    location / { return 200 "app ok\n"; }
}
EOF
