## Solution

1. `ls -l /srv/app/current` shows it's a symlink to `/srv/app/releases/20240121-0300-partial`.
2. `ls -ld /srv/app/current/` errors with *No such file or directory* — the target doesn't exist. The deploy
   was interrupted before that release was unpacked.
3. `ls -l /srv/app/releases/` shows the only real release on disk is `20240120-1200`.
4. Repoint `current` at it: `sudo ln -sfn /srv/app/releases/20240120-1200 /srv/app/current`.
   (`-f` replaces the existing link; `-n` avoids following the old link and creating a nested one.)
5. Verify: `cat /srv/app/current/index.html` shows the healthy `APP_OK` page.

Lesson: symlink-swap deploys fail closed when a release is missing. `ls -l` on the link and the target,
plus `readlink -f`, tell you instantly whether you have a dangling pointer vs. bad content.
