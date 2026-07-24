#!/bin/sh
# Runs at build time as root.
#
# Break: a debugging session added a rule to silence a noisy facility
# (local0, which the "billing-app" uses) by routing it to /dev/null with a
# `& stop` right after -- rsyslog processes rules top-to-bottom per message,
# and `& stop` halts further rule processing for anything that matched, so
# the real rule further down that would file it to /var/log/app/app.log
# never even runs. Nobody removed the debug rule afterwards.
set -eu

# imklog needs /proc/kmsg, which isn't available/permitted in a container;
# drop it so rsyslogd actually starts cleanly (irrelevant to the challenge
# itself, just container hygiene).
sed -i '/module(load="imklog")/d' /etc/rsyslog.conf

mkdir -p /var/log/app

cat > /etc/rsyslog.d/10-app.conf <<'EOF'
# TEMP: quieting local0 during an investigation -- REMOVE ME
local0.*    /dev/null
& stop

local0.*    /var/log/app/app.log
EOF
