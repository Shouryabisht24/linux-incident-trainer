## Solution

1. Only `deploy` is blocked → an sshd allow/deny list, not `~/.ssh` permissions.
2. `sudo tail -n 30 /var/log/auth.log` during a failed login shows
   `User deploy not allowed because not listed in AllowUsers`.
3. Locate it: `sudo grep -rin allowusers /etc/ssh/sshd_config /etc/ssh/sshd_config.d/` →
   `AllowUsers trainee` in `/etc/ssh/sshd_config.d/access.conf`. It's a whitelist and `deploy` isn't on it.
4. Add `deploy`: change the line to `AllowUsers trainee deploy`. Then `sudo sshd -t && sudo service ssh reload`
   (or `sudo kill -HUP $(cat /run/sshd.pid)`).
5. `ssh -i ~/deploy_key deploy@localhost` succeeds.

Lesson: `AllowUsers`/`AllowGroups` are whitelists — once present, anyone *not* listed is denied even with a
valid key. `DenyUsers`/`DenyGroups` are the blacklist equivalents. `sshd -T | grep -i allowusers` and
`auth.log` tell you which list is in effect and who it's excluding.
