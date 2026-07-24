## Solution

1. `ls -ld /srv/shared/dropbox` shows `drwxrwxrwx root root` -- mode `0777`. World-writable, which
   is needed so every job account can drop files there, but nothing stops one account from
   deleting or renaming files it doesn't own.
2. The fix for exactly this situation is the sticky bit, the same mechanism `/tmp` itself uses
   (`ls -ld /tmp` shows a trailing `t` instead of `x`). With the sticky bit set on a directory,
   the kernel only allows a file to be removed or renamed by: the file's owner, the directory's
   owner, or root -- regardless of the directory's own write permissions for everyone else.
3. Apply it: `sudo chmod +t /srv/shared/dropbox`. `ls -ld` now shows `drwxrwxrwt`.
4. Verify with the real, unprivileged accounts (not root, which bypasses this anyway): as
   `batchjob`, `sudo -u batchjob sh -c 'echo hi > /srv/shared/dropbox/f'`; as `otherjob`,
   `sudo -u otherjob rm /srv/shared/dropbox/f` now fails with `Operation not permitted`, whereas
   before adding the sticky bit it silently succeeded.

Lesson: a world-writable shared directory (`777`) is not the same thing as a *safe* shared
directory. Any multi-tenant drop/scratch location needs the sticky bit (mode `1777`) so accounts
can create files freely but can't destroy each other's. It's an easy detail to lose when a
directory gets recreated from scratch or "fixed" with a blunt `chmod 777`.
