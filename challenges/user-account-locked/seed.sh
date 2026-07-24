#!/bin/sh
# Runs at build time as root.
#
# The nightly ETL sync runs as the "etl" service account via `su - etl -c
# ...`. It's been failing with "Your account has expired; please contact
# your system administrator." An onboarding script set an account expiry
# date on every new account (probably meant for human contractor accounts,
# not service accounts) and it was never cleared for this one. This is a
# real block enforced by `su`/PAM's account checks -- it applies even when
# root is the one invoking `su`, unlike a simple password lock (`passwd -l`),
# which root can bypass freely.
set -eu

useradd -m -s /bin/bash etl
# Expire the account as of a date in the past (day 1 = 1970-01-02).
chage -E 1 etl
