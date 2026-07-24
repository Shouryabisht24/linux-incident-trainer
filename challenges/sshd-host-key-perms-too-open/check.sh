#!/bin/sh
# Solved when sshd is actually up and listening -- not just that the key
# files' permissions look right.
set -u
if pgrep -x sshd >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ':22 '; then
  echo "sshd is running and listening on port 22"
  exit 0
fi
echo "sshd is not running / not listening on port 22"
exit 1
