#!/bin/sh
# Runs at build time as root.
#
# Break: the orderapi service (runs as the unprivileged `orderapi` system
# account) logs fine today, but logrotate's `create` directive for it is
# wrong -- it stamps the brand-new post-rotation file as `root:root 0600`
# instead of `orderapi:orderapi`. Rotation itself works perfectly (no
# missingok trap here, no wrong path) -- the file that shows up right after
# is just one `orderapi` itself can't write a single byte into. Since
# nobody's watching the log for an app that's otherwise still serving
# traffic fine, this goes unnoticed until someone actually needs the logs.
set -eu

mkdir -p /var/log/orderapi
# Simulate an already-substantial log from before any rotation happened.
for i in $(seq 1 150); do
  echo "2026-07-$((i % 28 + 1))T00:00:00Z orderapi: handled order $i" >> /var/log/orderapi/orderapi.log
done
chown orderapi:orderapi /var/log/orderapi/orderapi.log
chmod 0640 /var/log/orderapi/orderapi.log

cat > /etc/logrotate.d/orderapi <<'EOF'
/var/log/orderapi/orderapi.log {
    daily
    rotate 7
    missingok
    notifempty
    create 0600 root root
}
EOF
