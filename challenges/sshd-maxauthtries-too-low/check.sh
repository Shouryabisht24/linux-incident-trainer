#!/bin/sh
# Solved when the full 3-key sequence (2 retired decoys, then the correct
# key) makes it all the way through without sshd cutting the connection off
# early. This is sshd's own MaxAuthTries enforcement -- it applies
# regardless of who's running the client.
set -u
OUT=$(ssh -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
        -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o BatchMode=yes -o ConnectTimeout=5 \
        -i /home/trainee/decoy1_key -i /home/trainee/decoy2_key -i /home/trainee/deploy_key \
        deploy@localhost 'echo SSH_OK' 2>/dev/null)
if [ "$OUT" = "SSH_OK" ]; then
  echo "full retired-then-current key sequence authenticated successfully"
  exit 0
fi
echo "the multi-key sequence is still being cut off before the correct key"
exit 1
