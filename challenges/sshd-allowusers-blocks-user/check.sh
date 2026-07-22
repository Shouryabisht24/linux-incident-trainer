#!/bin/sh
# Solved when the deploy user can authenticate over SSH with its key.
set -u
OUT=$(ssh -i /home/trainee/deploy_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o BatchMode=yes -o ConnectTimeout=5 deploy@localhost 'echo SSH_OK' 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "deploy can authenticate over SSH with its key"
  exit 0
fi
echo "deploy still cannot log in over SSH"
exit 1
