#!/bin/sh
# Runs at build time as root.
#
# Break: a "disable weak ciphers" hardening pass restricted sshd's Ciphers
# list, but restricted it to a single *legacy* cipher (3des-cbc) instead of
# to modern ones -- almost certainly a copy-paste from an old hardening
# guide's "before" example instead of its "after" recommendation. A modern
# ssh client doesn't propose 3des-cbc at all by default, so the transport
# layer itself fails to agree on an algorithm before authentication is even
# attempted -- no user, key, or access-control directive is involved. This
# is a different failure class from every other sshd challenge here: it's a
# transport-negotiation mismatch, not an authentication or access-control
# rejection.
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
cat > /etc/ssh/sshd_config.d/ciphers.conf <<'EOF'
# "Disable weak ciphers" hardening -- this restricted the allowed list down
# to a legacy-only cipher instead of a modern one.
Ciphers 3des-cbc
EOF
