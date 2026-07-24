#!/bin/sh
# Runs at build time as root.
#
# /srv/shared/dropbox is a shared scratch directory where several unprivileged
# batch-job accounts drop hand-off files for each other (a common pattern for
# multi-tenant scratch/spool dirs, same idea as the world-writable /tmp).
# For that to be safe, it needs mode 1777 -- world-writable so anyone can
# create files, PLUS the sticky bit so only a file's *owner* (or root) can
# remove/rename it once created.
#
# The break: someone recreated the directory (or "fixed" a permissions error
# the blunt way) with plain 0777 -- world-writable, but no sticky bit. That
# means "otherjob" (an unrelated unprivileged account) can delete or clobber
# files "batchjob" drops there, which is exactly what happened last week: a
# handoff file went missing because another job's cleanup script swept the
# whole directory. Root would ignore this distinction entirely (root can
# always unlink anything) -- the sticky bit specifically matters to these two
# ordinary, unprivileged accounts, which is what check.sh actually exercises.
set -eu

useradd -m -s /bin/bash batchjob
useradd -m -s /bin/bash otherjob

mkdir -p /srv/shared/dropbox
chown root:root /srv/shared/dropbox
chmod 0777 /srv/shared/dropbox
