#!/bin/sh
# Solved when dpkg's database has no half-configured packages left.
set -u
if dpkg --audit 2>/dev/null | grep -q '[a-z]'; then
  echo "dpkg still reports packages not fully configured:"
  dpkg --audit 2>/dev/null | tail -3
  exit 1
fi
STATUS=$(dpkg-query -W -f='${Status}' tree 2>/dev/null)
if [ "$STATUS" = "install ok installed" ]; then
  echo "all packages fully configured"
  exit 0
fi
echo "tree not fully configured (status: $STATUS)"
exit 1
