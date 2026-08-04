#!/bin/sh
# Solved when sshd answers on port 22 specifically (what the pipeline uses).
set -u
OUT=$(ssh -i /home/trainee/deploy_key -p 22 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o BatchMode=yes -o ConnectTimeout=5 deploy@localhost 'echo SSH_OK' 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "sshd is answering on port 22"
  exit 0
fi
echo "sshd is still not reachable on port 22"
exit 1
