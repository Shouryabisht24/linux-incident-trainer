#!/bin/sh
# Solved when deploy can actually run a normal remote command over SSH, not
# just authenticate -- ForceCommand lets auth succeed but silently replaces
# whatever command was requested, so checking the actual command output
# (not just the exit/connection status) is what matters here.
set -u
OUT=$(ssh -i /home/trainee/deploy_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o BatchMode=yes -o ConnectTimeout=5 deploy@localhost 'echo SSH_OK' 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "deploy can run a normal remote command over SSH"
  exit 0
fi
echo "deploy's requested command did not actually run (got: '$OUT')"
exit 1
