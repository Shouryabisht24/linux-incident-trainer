#!/bin/sh
# Break: the app's log file is a symlink to /dev/null (a common "make the disk
# alert go away" hack), so everything written to it is silently discarded.
set -eu
mkdir -p /var/log/paymentd
ln -sf /dev/null /var/log/paymentd/paymentd.log

# The app's logger: appends a line to its log file.
cat > /usr/local/bin/paymentd-log <<'EOF'
#!/bin/sh
echo "$(date -Is) $*" >> /var/log/paymentd/paymentd.log
EOF
chmod +x /usr/local/bin/paymentd-log
