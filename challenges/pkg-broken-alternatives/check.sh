#!/bin/sh
# Solved when mytool actually runs.
set -u
if mytool >/dev/null 2>&1; then
  echo "mytool runs"
  exit 0
fi
echo "mytool still cannot be executed"
exit 1
