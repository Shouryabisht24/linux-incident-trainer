#!/bin/sh
# Solved when trainee's own `ssh apphost` (relying on ~/.ssh/config) works.
# Must run as the real actor (trainee) -- the ssh client's config-permission
# check is keyed off the invoking user's relationship to the file, so
# testing as root would not exercise the same code path.
set -u
OUT=$(su - trainee -c "ssh apphost 'echo SSH_OK'" 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "ssh apphost works via trainee's own ~/.ssh/config"
  exit 0
fi
echo "ssh apphost still fails"
exit 1
