#!/bin/sh
# Solved when netops can use sudo non-interactively, and the sudoers policy
# as a whole is syntactically valid (so the fix was a real repair, not e.g.
# deleting the drop-in and granting netops some other broken way).
set -u
if visudo -c >/dev/null 2>&1 && sudo -u netops sudo -n id >/dev/null 2>&1; then
  echo "netops can use sudo and sudoers policy is valid"
  exit 0
fi
echo "netops still cannot use sudo, or sudoers policy has a syntax error"
exit 1
