#!/bin/sh
# Solved when a plain ssh client can actually negotiate a session and log
# in as deploy (i.e. sshd's Ciphers list overlaps with what a normal client
# proposes).
set -u
OUT=$(ssh -i /home/trainee/deploy_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o BatchMode=yes -o ConnectTimeout=5 deploy@localhost 'echo SSH_OK' 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "ssh can negotiate a cipher and deploy can log in"
  exit 0
fi
echo "ssh still cannot negotiate a session"
exit 1
