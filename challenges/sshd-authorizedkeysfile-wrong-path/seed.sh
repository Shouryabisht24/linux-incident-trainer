#!/bin/sh
# Runs at build time as root.
#
# Break: a half-finished migration to a centralized authorized-keys layout
# set `AuthorizedKeysFile` to a path under /etc/ssh instead of the default
# `~/.ssh/authorized_keys`. deploy's key was never copied to the new
# location, so sshd (which only consults whatever AuthorizedKeysFile points
# at -- the default is *not* also checked once this directive is set) finds
# no keys for deploy at all and falls through to password auth, which
# doesn't exist for this account. The key itself, and ~/.ssh's permissions,
# are completely fine -- sshd is just looking in the wrong place.
set -eu

useradd -m -s /bin/bash deploy
mkdir -p /run/sshd
ssh-keygen -A >/dev/null

mkdir -p /home/deploy/.ssh
ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_deploy >/dev/null
# Leftover from before the migration -- correct key material, wrong place
# once AuthorizedKeysFile below takes effect.
cp /home/deploy/.ssh/id_deploy.pub /home/deploy/.ssh/authorized_keys
cp /home/deploy/.ssh/id_deploy /home/trainee/deploy_key
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown trainee:trainee /home/trainee/deploy_key
chmod 600 /home/trainee/deploy_key

mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/authkeys.conf <<'EOF'
# Centralized authorized-keys layout (migration in progress).
AuthorizedKeysFile /etc/ssh/authorized_keys/%u
EOF
# Note: /etc/ssh/authorized_keys/ is intentionally never created here -- the
# migration script that was supposed to populate it never ran.
