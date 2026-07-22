## Solution

1. `ssh -i ~/deploy_key deploy@localhost` ignores the key and prompts for a password.
2. Check sshd's reason: `sudo tail -n 30 /var/log/auth.log` shows
   `Authentication refused: bad ownership or modes for directory /home/deploy/.ssh` (or the file).
3. This is `StrictModes` (on by default): sshd won't trust `~/.ssh` or `authorized_keys` if they're
   writable by anyone but the owner. `ls -ld /home/deploy/.ssh` shows `0777`, `authorized_keys` is `0666`.
4. Fix the modes (and ownership): `sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys`.
5. `ssh -i ~/deploy_key deploy@localhost` now logs in.

Lesson: SSH key auth silently "falls back to password" when the server rejects the key. The reason is almost
always permissions — `~/.ssh` must be `700` and `authorized_keys` `600`, owned by the user. `auth.log` tells
you exactly which path StrictModes rejected.
