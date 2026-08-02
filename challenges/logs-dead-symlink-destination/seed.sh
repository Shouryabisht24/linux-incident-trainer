#!/bin/sh
# Runs at build time as root.
#
# Break: reportd's config points its log at /var/log/reportd/reportd.log,
# which is a symlink -- not to /dev/null (that's a different challenge,
# logs-app-log-devnull), but to a path on what used to be a separate
# "archive" log volume that no longer exists
# (/var/log/reportd-archive/2026-06-01.log). Since the *directory* the
# symlink points into is gone, not just the file, opening it for append
# fails outright (ENOENT) rather than transparently creating a fresh file
# there. reportd's logging wrapper swallows that error (a common
# fire-and-forget pattern so a logging hiccup never takes down the app
# itself), so the app keeps running with zero visible complaints while
# every single log line silently disappears.
set -eu
mkdir -p /var/log/reportd
ln -sf /var/log/reportd-archive/2026-06-01.log /var/log/reportd/reportd.log

mkdir -p /etc/reportd
cat > /etc/reportd/reportd.conf <<'EOF'
LogFile=/var/log/reportd/reportd.log
EOF

# The app's logger: reads its configured log path and appends a line to it,
# swallowing any error the way a lot of real fire-and-forget logging
# wrappers do.
cat > /usr/local/bin/reportd-log <<'EOF'
#!/bin/sh
LOGFILE=$(sed -n 's/^LogFile=//p' /etc/reportd/reportd.conf)
echo "$(date -Is) $*" >> "$LOGFILE" 2>/dev/null
EOF
chmod +x /usr/local/bin/reportd-log
