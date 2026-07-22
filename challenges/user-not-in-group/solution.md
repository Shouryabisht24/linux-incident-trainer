## Solution

1. `sudo -u deploy touch /srv/app/x` → `Permission denied`.
2. `ls -ld /srv/app` shows `drwxrws--- root appteam` — writable only by owner (root) and the `appteam` group.
3. `id deploy` shows it's **not** in `appteam`, so the group-write bit doesn't apply to it.
4. Add it (append, don't overwrite existing groups): `sudo usermod -aG appteam deploy`.
5. Group changes take effect in new sessions — `sudo -u deploy touch /srv/app/x` now succeeds
   (the `setgid` bit `s` on the dir also makes new files inherit the `appteam` group).

Lesson: `usermod -G` **replaces** a user's supplementary groups; always use `-aG` to append. And new group
membership only applies to sessions started after the change — an already-logged-in shell won't see it until re-login.
