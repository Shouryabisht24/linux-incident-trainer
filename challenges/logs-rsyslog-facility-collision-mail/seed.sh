#!/bin/sh
# Runs at build time as root.
#
# Break: shipnotify's logging wrapper was written by copy-pasting from an
# old mail-notification script and never had its syslog facility updated --
# it tags every message as facility `mail` instead of the `local3` facility
# the dedicated per-app rsyslog rule actually expects. There's no debug rule
# silencing anything and nothing routes to /dev/null: rsyslog's stock,
# out-of-the-box default config (shipped by the rsyslog package itself,
# `mail.*  -/var/log/mail.log` in /etc/rsyslog.conf) is a completely
# legitimate rule that was here before shipnotify ever existed -- it just
# happens to be exactly where shipnotify's mistagged messages go instead of
# the dedicated log the ops team is actually watching.
set -eu

# imklog needs /proc/kmsg, unavailable in a container; drop it so rsyslogd
# starts cleanly (container hygiene, unrelated to the challenge itself).
sed -i '/module(load="imklog")/d' /etc/rsyslog.conf

mkdir -p /var/log/shipnotify

cat > /etc/rsyslog.d/25-shipnotify.conf <<'EOF'
# Dedicated rule for the shipnotify service.
local3.*    /var/log/shipnotify/shipnotify.log
EOF

# The app's logging wrapper: tags every message with the wrong facility.
cat > /usr/local/bin/shipnotify-log <<'EOF'
#!/bin/sh
logger -p mail.info -t shipnotify "$*"
EOF
chmod +x /usr/local/bin/shipnotify-log
