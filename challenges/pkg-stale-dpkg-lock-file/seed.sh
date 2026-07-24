#!/bin/sh
# Runs at build time as root.
#
# dpkg/apt coordinate through a real OS-level advisory lock (flock) on
# /var/lib/dpkg/lock-frontend, not just the file's mere existence -- an
# empty leftover lock file with nobody actually holding the lock blocks
# nothing at all, a new dpkg/apt invocation would acquire it immediately.
# The real incident is a process that's still genuinely alive and holding
# that lock: an apt/dpkg run from an interrupted maintenance window that
# hung (e.g. on a stuck post-install prompt) and was never cleaned up.
# Every subsequent dpkg/apt command refuses with "Could not get lock
# /var/lib/dpkg/lock-frontend. It is held by process <pid>".
set -eu
mkdir -p /var/lib/dpkg
touch /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock
