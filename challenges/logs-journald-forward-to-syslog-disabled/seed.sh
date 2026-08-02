#!/bin/sh
# Runs at build time as root.
#
# Break: rsyslog on this box doesn't read the journal directly -- like most
# stock rsyslog installs alongside journald, it receives messages via the
# traditional syslog protocol over the socket journald forwards to
# (/run/systemd/journal/syslog), which only happens when journald's own
# ForwardToSyslog setting is enabled. Someone flipped it off (framed as
# "cut down on duplicate logging noise" -- a real, plausible-sounding
# tuning change) without realizing invoiced's dedicated rsyslog rule
# depends entirely on that forwarded feed. Messages still land in the
# journal itself just fine (journalctl -t invoiced proves that) -- they
# just never reach rsyslog, so the dedicated per-app log file rsyslog is
# supposed to file them into goes quiet with zero errors anywhere.
set -eu

# imklog needs /proc/kmsg, unavailable in a container; drop it so rsyslogd
# starts cleanly (container hygiene, unrelated to the challenge itself).
sed -i '/module(load="imklog")/d' /etc/rsyslog.conf

mkdir -p /var/log/invoiced

cat > /etc/rsyslog.d/25-invoiced.conf <<'EOF'
# Dedicated rule for the invoiced service (fed via journald forwarding).
:programname, isequal, "invoiced"    /var/log/invoiced/invoiced.log
EOF

mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/noforward.conf <<'EOF'
[Journal]
ForwardToSyslog=no
EOF
