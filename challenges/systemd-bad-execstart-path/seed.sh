#!/bin/sh
# Break: the apiserver binary actually lives in /usr/local/bin, but the unit's
# ExecStart points at /usr/local/sbin/apiserver (doesn't exist) -> 203/EXEC.
set -eu
cat > /usr/local/bin/apiserver <<'EOF'
#!/bin/sh
echo "apiserver: up"
exec sleep infinity
EOF
chmod +x /usr/local/bin/apiserver

cat > /etc/systemd/system/apiserver.service <<'EOF'
[Unit]
Description=API server
After=network.target

[Service]
ExecStart=/usr/local/sbin/apiserver
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/apiserver.service /etc/systemd/system/multi-user.target.wants/apiserver.service
