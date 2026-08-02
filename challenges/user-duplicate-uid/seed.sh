#!/bin/sh
# Runs at build time as root.
#
# Break: "logshipper" is the original, legitimate account (UID 1301) that
# owns /var/lib/logship/data. A provisioning script later created
# "metricsagent" and, due to a stale "next free UID" calculation, pinned it
# to the exact same UID via useradd's --non-unique flag (a real flag, easy
# to misuse when a template command gets copy-pasted with a hardcoded UID).
# The kernel only ever sees the number 1301 -- both names "are" that UID as
# far as file ownership, permission checks, and process credentials are
# concerned. NSS lookups that go by UID (getent passwd 1301, `ls -l`, `stat`)
# only ever surface the FIRST matching /etc/passwd entry, so everything
# looks like "logshipper" even when it's actually metricsagent's own file --
# a real, observable identity-confusion bug, not just a cosmetic one.
set -eu

useradd -m -u 1301 -s /bin/bash logshipper
mkdir -p /var/lib/logship/data
chown -R logshipper:logshipper /var/lib/logship
printf 'legitimate logshipper data\n' > /var/lib/logship/data/shipment.log
chown logshipper:logshipper /var/lib/logship/data/shipment.log

useradd -m -o -u 1301 -s /bin/bash metricsagent
