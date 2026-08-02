#!/bin/sh
# Runs at build time as root.
#
# Break: /srv/exports has NO setgid bit, so a newly created file's group is
# whatever the creating process's PRIMARY group is at that moment -- not the
# directory's group, and not anything from the creator's supplementary
# groups either. "dataexport" is the directory's owner (so it can always
# write there, that part was never broken), but its primary group in
# /etc/passwd was left as its own auto-created private group instead of
# being pointed at "exportreaders". So every file it creates comes out
# group-owned by "dataexport" (a group only dataexport itself belongs to),
# and "analyst" -- a real, correctly-configured member of "exportreaders"
# via supplementary group membership -- can never read them.
#
# This is a genuinely different mechanism from a missing supplementary
# group: adding dataexport to exportreaders as a *supplementary* group
# (usermod -aG) would NOT fix this, because new-file group assignment comes
# from the creating process's effective/primary gid, never its supplementary
# group list. Only correcting the PRIMARY group (usermod -g) fixes it.
set -eu

groupadd exportreaders
useradd -m -s /bin/bash dataexport
useradd -m -s /bin/bash analyst
usermod -aG exportreaders analyst

mkdir -p /srv/exports
chown dataexport:exportreaders /srv/exports
chmod 0770 /srv/exports
