#!/bin/sh
# Break: the health check script lost its execute bits (mode 644). Even root
# cannot execve() a file with no execute bit, and the real actor here (the
# unprivileged "monitor" user) certainly can't.
set -eu
useradd -r -s /usr/sbin/nologin monitor
cat > /usr/local/bin/healthcheck <<'EOF'
#!/bin/sh
echo "OK"
EOF
chown root:root /usr/local/bin/healthcheck
chmod 644 /usr/local/bin/healthcheck
