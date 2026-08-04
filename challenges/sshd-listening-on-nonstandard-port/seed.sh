#!/bin/sh
# Runs at build time as root.
#
# Break: a well-meaning "security hardening" change moved sshd off the
# default port entirely (Port 2249, picked to not be an obviously-suspicious
# round number) and never told the deploy pipeline, which is hardcoded to
# port 22. sshd itself is completely healthy -- it's just not listening
# where the pipeline (and everyone's muscle memory) expects.
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

mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/port.conf <<'EOF'
# Hardening change: moved off the default port. Pipeline still expects 22.
Port 2249
EOF
