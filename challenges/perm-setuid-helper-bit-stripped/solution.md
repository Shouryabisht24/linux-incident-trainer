## Solution

1. Reproduce the failure as the real actor: `sudo -u auditor /usr/local/bin/read-audit-log` prints
   `read-audit-log: open: Permission denied` (or similar). Running the same binary as root/trainee
   would "work" and hide the actual problem -- the daily reality is `auditor` running it.
2. Inspect the binary: `ls -l /usr/local/bin/read-audit-log` shows `-rwxr-xr-x 1 root root`.
   It's owned by root and executable, but the owner-execute bit is a plain `x`, not `s`. That
   missing `s` is the setuid bit -- without it, the helper runs with the *caller's* privileges
   (auditor), not root's, and `auditor` has no permission to open `/var/log/secure/access.log`
   (`root:root`, mode `600`).
3. Restore the setuid bit: `sudo chmod u+s /usr/local/bin/read-audit-log`. Confirm with
   `ls -l /usr/local/bin/read-audit-log` -- it should now show `-rwsr-xr-x`.
4. Verify as the real user again: `sudo -u auditor /usr/local/bin/read-audit-log` now prints the
   log contents.

Lesson: the setuid bit is what lets a purpose-built helper binary do one privileged thing on
behalf of an unprivileged user without handing them broader access (sudo, group membership, or
outright ownership of the protected file). It's easy to lose during a "harden file permissions"
pass that blindly strips extra mode bits, and `ls -l` still "looks fine" (root-owned, executable)
unless you specifically check for the `s`. Also worth remembering: the kernel refuses to honor
setuid on interpreted scripts (anything starting with `#!`) precisely because of this kind of
scenario -- a real setuid helper has to be a compiled binary.
