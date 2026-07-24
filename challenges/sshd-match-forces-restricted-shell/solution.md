## Solution

1. Authentication isn't the problem here -- `deploy`'s key works and the connection is accepted
   without complaint. Something about what happens *after* login is wrong, so the usual
   authorized_keys-permissions / `AllowUsers` / `PubkeyAuthentication` checks aren't it.
2. Read the entire sshd config, not just the top: `cat /etc/ssh/sshd_config`. Near the bottom is a
   conditional block:
   ```
   Match User deploy
       ForceCommand internal-sftp
       AllowTcpForwarding no
       X11Forwarding no
   ```
3. `ForceCommand` unconditionally replaces whatever command a client actually asked to run with
   the one configured here -- `ssh deploy@host 'echo SSH_OK'` connects fine, but sshd runs
   `internal-sftp` instead of `echo SSH_OK`, so the client gets no matching output at all (from an
   interactive `ssh` client it would just look like a hang or an unexpected SFTP-ish response).
   This block was written for a different, genuinely sftp-only transfer account and ended up
   matching `deploy` too, most likely from a copy-pasted config block that reused the wrong
   username.
4. Remove the block (or, if some restriction really was intended for a different account, correct
   the `Match User` line to name that account instead of `deploy`):
   `sudo sed -i '/^Match User deploy$/,$d' /etc/ssh/sshd_config` (deletes from that line to the end
   of the file, since it's the last block).
5. Validate the config before reloading (a syntax mistake here can lock out SSH entirely):
   `sudo sshd -t`.
6. Restart sshd (no systemd/init script in this environment, so directly): `sudo pkill sshd &&
   sudo /usr/sbin/sshd`.
7. Verify: `ssh -i ~/deploy_key deploy@localhost 'echo SSH_OK'` now prints `SSH_OK`.

Lesson: `Match` blocks apply conditionally and are easy to lose track of once a config file grows
past a single screen -- a working login with commands that silently don't do what was asked is the
signature of `ForceCommand`, not an auth problem. Always read a suspicious sshd config end to end,
and always `sshd -t` before reloading, since a bad `Match` edit can just as easily lock everyone out
entirely.
