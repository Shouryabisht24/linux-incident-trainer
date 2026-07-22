#!/bin/sh
set -eu
useradd -m -s /bin/bash deploy
mkdir -p /run/sshd
ssh-keygen -A >/dev/null
mkdir -p /home/deploy/.ssh
ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_deploy >/dev/null
cp /home/deploy/.ssh/id_deploy.pub /home/deploy/.ssh/authorized_keys
cp /home/deploy/.ssh/id_deploy /home/trainee/deploy_key
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown trainee:trainee /home/trainee/deploy_key
chmod 600 /home/trainee/deploy_key
# Break: sshd's StrictModes rejects keys when ~/.ssh or authorized_keys are
# group/world-writable. A restore left them world-writable.
chmod 0777 /home/deploy/.ssh
chmod 0666 /home/deploy/.ssh/authorized_keys
