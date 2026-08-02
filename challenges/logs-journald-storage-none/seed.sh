#!/bin/sh
# Break: journald's Storage= is explicitly set to `none`, which means
# journald accepts messages but keeps nothing at all -- no /run journal, no
# /var/log/journal journal, nothing to query even within the current boot.
# This is deliberately distinct from `logs-journald-not-persistent`
# (Storage=volatile, which DOES keep a queryable in-memory journal for the
# current boot -- it's only lost across a reboot). Here, nothing is ever
# retained in the first place, even seconds after it's logged.
set -eu
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/nostore.conf <<'EOF'
[Journal]
Storage=none
EOF
