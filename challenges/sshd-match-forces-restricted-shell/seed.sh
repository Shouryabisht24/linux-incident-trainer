#!/bin/sh
# Runs at build time as root.
#
# The "deploy" account is a normal interactive user with a valid key and
# correct file permissions -- key auth itself is completely fine. The break
# is a `Match User` block, originally written for a *different*,
# genuinely-sftp-only service account, that ended up matching "deploy" too
# (a copy-paste of the block reused the wrong username). It forces every
# session for that user into `internal-sftp` via ForceCommand, regardless of
# what command was actually requested -- so a normal `ssh deploy@host
# '<command>'` silently never runs the requested command at all.
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

cat >> /etc/ssh/sshd_config <<'EOF'

# NOTE: meant only for the sftp-only backup-transfer account -- copy-paste
# reused "deploy" here by mistake.
Match User deploy
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
EOF
