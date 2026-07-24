#!/bin/sh
# Runs at build time as root.
#
# The "reports" account originally had UID 1050, and its data files were
# created and owned under that UID. A provisioning tool later recreated the
# account (e.g. restoring from a config-management backup that didn't
# reserve the same UID) and it came back as UID 1080 instead. Nothing about
# the files themselves changed -- they're still owned by the numeric UID
# 1050 on disk -- but the "reports" *account* now points at a different UID,
# so the account and its own files no longer agree on who "reports" is.
# `ls -l` shows the files owned by a bare number instead of a username,
# and the reports account gets "Permission denied" on its own data.
set -eu

useradd -m -u 1050 -s /bin/bash reports
mkdir -p /home/reports/data
printf 'metric,value\nrevenue,1000\n' > /home/reports/data/report.csv
chown -R 1050:1050 /home/reports/data

# Simulate the account being recreated with a different UID. userdel (no -r)
# removes only the account entry; the files on disk, still numerically owned
# by 1050, are untouched.
userdel reports
useradd -m -u 1080 -s /bin/bash reports
