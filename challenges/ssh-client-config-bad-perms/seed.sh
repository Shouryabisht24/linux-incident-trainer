#!/bin/sh
# Runs at build time as root.
#
# Break: this one is entirely client-side. The `ssh` client itself (running
# as trainee's own unprivileged process -- nothing to do with sshd, root, or
# server-side access control) refuses to honor a per-user config file that's
# writable by group or other, exactly the same StrictModes-style paranoia
# sshd applies server-side to authorized_keys, but enforced independently by
# the ssh(1) client binary. A stray `chmod` (someone fixing "permission
# denied" the blunt way) left ~/.ssh/config world-writable, so ssh now
# refuses to read it at all -- the "apphost" alias it defines never
# resolves, and ssh just errors out instead of connecting anywhere.
set -eu

useradd -m -s /bin/bash deploy
mkdir -p /run/sshd
ssh-keygen -A >/dev/null

mkdir -p /home/deploy/.ssh
ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_deploy >/dev/null
cp /home/deploy/.ssh/id_deploy.pub /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

mkdir -p /home/trainee/.ssh
cp /home/deploy/.ssh/id_deploy /home/trainee/deploy_key
chmod 600 /home/trainee/deploy_key

cat > /home/trainee/.ssh/config <<'EOF'
Host apphost
    HostName localhost
    User deploy
    IdentityFile /home/trainee/deploy_key
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    BatchMode yes
    ConnectTimeout 5
EOF

chown -R trainee:trainee /home/trainee/.ssh /home/trainee/deploy_key
chmod 700 /home/trainee/.ssh
# The actual break: config should be 600, someone left it world-writable.
chmod 0666 /home/trainee/.ssh/config
