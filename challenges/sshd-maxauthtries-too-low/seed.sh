#!/bin/sh
# Runs at build time as root.
#
# Break: a hardening pass set MaxAuthTries very low to slow down credential
# stuffing. But this fleet's deploy automation legitimately offers several
# SSH keys in sequence per connection (a leftover of a key rotation --
# retired keys are still offered before the current one, rather than
# reconfiguring every runner). Each offered key that sshd rejects counts
# against MaxAuthTries, so with the limit set too low, the connection gets
# dropped ("Too many authentication failures") after the retired keys fail,
# *before* sshd ever gets to evaluate the correct, current key -- a
# legitimate login broken by a limit tuned only with brute-force in mind.
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

# Two retired keys the automation still offers first (never authorized for
# deploy), then the current, correct key last.
ssh-keygen -t ed25519 -N "" -f /home/trainee/decoy1_key >/dev/null
ssh-keygen -t ed25519 -N "" -f /home/trainee/decoy2_key >/dev/null
cp /home/deploy/.ssh/id_deploy /home/trainee/deploy_key
rm -f /home/trainee/decoy1_key.pub /home/trainee/decoy2_key.pub
chown trainee:trainee /home/trainee/decoy1_key /home/trainee/decoy2_key /home/trainee/deploy_key
chmod 600 /home/trainee/decoy1_key /home/trainee/decoy2_key /home/trainee/deploy_key

mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/authtries.conf <<'EOF'
# Anti-brute-force hardening -- tuned without accounting for legitimate
# multi-key rotation flows.
MaxAuthTries 2
EOF
