#!/bin/sh
# Runs at build time as root.
#
# Break: a box-wide password-aging rollout set every account's "last
# password change" date to the special sentinel value 0 (chage -d 0), which
# forces an immediate mandatory password change on next login/session --
# this is real PAM/login enforcement (pam_unix's account phase), not
# something root can just wave through. When su tries to start
# backupsvc's session it hits this and, since there's no interactive
# terminal to actually supply a new password, fails with an authentication
# token error instead of ever running the requested command.
#
# This is distinct from user-account-locked (chage -E, a hard account
# EXPIRY date) -- this is chage's password-AGING mechanism: the account
# itself is not expired and never was, but its password is being treated as
# stale enough that a change is mandatory before anything else can happen.
set -eu

useradd -m -s /bin/bash backupsvc
chage -d 0 backupsvc
