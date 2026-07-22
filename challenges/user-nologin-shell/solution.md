## Solution

1. `su - ci -c 'echo ok'` prints `This account is currently not available` — the message `/usr/sbin/nologin`
   prints when it's a user's shell.
2. `getent passwd ci` confirms the 7th field is `/usr/sbin/nologin`.
3. Restore a real shell: `sudo usermod -s /bin/bash ci`.
4. `su - ci -c 'echo ok'` now prints `ok`.

Lesson: `nologin` as a login shell is correct for accounts that should never log in — but it also blocks
`su - <user>`, cron `su` wrappers, and login-shell automation. Service accounts that must *run* login-shell
jobs need `/bin/bash` (or `/bin/sh`); use `nologin` only for accounts that truly never need a shell.
