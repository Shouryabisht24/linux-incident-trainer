#!/bin/sh
# Break: the /etc/alternatives/mytool link points at a version (2.0) that isn't
# installed, so the /usr/local/bin/mytool -> /etc/alternatives/mytool -> (missing)
# chain is dangling and the command can't be found.
set -eu
cat > /usr/local/bin/mytool-1.0 <<'EOF'
#!/bin/sh
echo "mytool v1.0 running"
EOF
chmod +x /usr/local/bin/mytool-1.0

# Register the alternative properly first...
update-alternatives --install /usr/local/bin/mytool mytool /usr/local/bin/mytool-1.0 100
# ...then break it: repoint the alternative at a non-existent v2.0 binary.
ln -sf /usr/local/bin/mytool-2.0 /etc/alternatives/mytool
