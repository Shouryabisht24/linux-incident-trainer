#!/bin/sh
# Runs at build time as root.
#
# Break: a "permissions audit" script ran `chmod 644` across broad swaths of
# /etc, including sshd's own host private keys. sshd refuses to use a host
# key file that's readable by anyone but root -- and with every host key
# rejected, it has nothing left to identify itself with and exits outright
# ("no hostkeys available -- exiting"), rather than starting insecurely.
# This is sshd's own explicit safety check, not a kernel DAC bypass issue --
# it applies even though sshd itself runs as root.
set -eu

mkdir -p /run/sshd
ssh-keygen -A >/dev/null 2>&1

chmod 644 /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_ecdsa_key /etc/ssh/ssh_host_ed25519_key
