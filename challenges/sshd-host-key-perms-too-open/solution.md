## Solution

1. Run sshd in the foreground to see its actual startup output, not just "it's not running":
   `sudo /usr/sbin/sshd -D -e`. It logs, for each host key:
   ```
   Permissions 0644 for '/etc/ssh/ssh_host_rsa_key' are too open.
   It is required that your private key files are NOT accessible by others.
   This private key will be ignored.
   ```
   ...followed by, once all three keys have been rejected: `sshd: no hostkeys available --
   exiting`.
2. Confirm: `ls -l /etc/ssh/ssh_host_*_key` shows all three private host keys at mode `644`
   (group/world readable).
3. sshd enforces this itself, deliberately -- it will not use a private key file that anyone
   besides root can read, no matter who's running sshd. With every host key rejected, there's
   nothing left for it to identify itself with, so it exits rather than starting without one.
4. Fix the permissions: `sudo chmod 600 /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_ecdsa_key
   /etc/ssh/ssh_host_ed25519_key` (or `chmod 600 /etc/ssh/ssh_host_*_key`).
5. Start the service: `sudo service ssh start`.
6. Verify: `ss -tln | grep :22` shows sshd listening.

Lesson: sshd's host-key permission check is a deliberate application-level safeguard, not a kernel
permission bypass issue -- it applies regardless of who's running sshd (including root), and it's
an all-or-nothing failure: as long as at least one host key is still properly protected, sshd
starts using that one; only once *every* host key is rejected does it refuse to start at all. A
broad, automated `chmod` sweep across `/etc` is an easy way to catch every key file at once and
turn a partial degradation into a full outage.
