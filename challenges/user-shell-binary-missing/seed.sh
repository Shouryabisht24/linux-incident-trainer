#!/bin/sh
# Runs at build time as root.
#
# Break: reportbot's login shell field in /etc/passwd points at
# /usr/local/sbin/corp-shell -- a custom, audited wrapper binary that was
# supposed to be deployed by config management alongside the account, but
# never actually landed on disk (a real, valid path that simply has nothing
# there). This is distinct from user-nologin-shell: nologin IS installed and
# IS the real /usr/sbin/nologin binary -- it's an intentional, working
# lockout that runs successfully and prints a message before exiting
# nonzero. Here the shell binary itself is just missing, so exec() fails
# outright with ENOENT before anything resembling a shell ever runs.
set -eu

useradd -m -s /usr/local/sbin/corp-shell reportbot
