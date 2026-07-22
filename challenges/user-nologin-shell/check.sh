#!/bin/sh
# Solved when the ci account can run a login shell command.
set -u
OUT=$(su - ci -c 'echo ok' 2>/dev/null)
if [ "$OUT" = "ok" ]; then
  echo "ci account can run a login shell"
  exit 0
fi
echo "ci account still cannot run a login shell"
exit 1
