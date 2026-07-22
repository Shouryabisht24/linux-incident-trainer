#!/bin/sh
# Solved when oncall can run a command via sudo non-interactively.
set -u
if sudo -u oncall sudo -n id >/dev/null 2>&1; then
  echo "oncall can use sudo"
  exit 0
fi
echo "oncall still cannot use sudo"
exit 1
