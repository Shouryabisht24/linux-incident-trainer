#!/bin/sh
# Runs at build time as root.
#
# The internal DNS setup: dnsmasq acts as this host's local resolver and is
# authoritative for the "internal.example" zone, where the "db" host really
# lives (db.internal.example -> 127.0.0.1, where the app itself listens on
# 8080). Apps on this box are only ever configured to look up the short name
# "db" -- they rely on the resolver's search-domain config to expand it to
# the right FQDN. The break (a stale search domain left over from before a
# rename of the internal zone) is applied at container start in the
# Dockerfile CMD, since /etc/resolv.conf can't be edited during the build.
set -eu

mkdir -p /etc/dnsmasq.d
cat > /etc/dnsmasq.d/internal.conf <<'EOF'
no-resolv
no-hosts
bind-interfaces
listen-address=127.0.0.1
address=/db.internal.example/127.0.0.1
EOF

rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/conf.d/app.conf <<'EOF'
server {
    listen 127.0.0.1:8080;
    location / { return 200 "db ok\n"; }
}
EOF
