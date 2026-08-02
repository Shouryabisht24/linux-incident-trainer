## Solution

1. `su - reportbot -c 'echo ok'` fails with:
   `su: failed to execute /usr/local/sbin/corp-shell: No such file or directory`
   This is an `exec()`-level failure message from `su` itself, not a shell's own output -- `su` never even
   got as far as running anything as reportbot.
2. `getent passwd reportbot` confirms the account's shell field is `/usr/local/sbin/corp-shell`.
   `test -x /usr/local/sbin/corp-shell` (or `ls -l` it) confirms it: the path simply doesn't exist on this
   box. Whatever deployed this account expected a custom, audited shell wrapper to be installed alongside
   it, and that half of the deployment never happened (or was cleaned up later without anyone updating the
   account).
3. There's no fixture or package available inside this container to reinstall the missing wrapper, so the
   realistic remediation is what an on-call sysadmin would actually do under time pressure: point the
   account at a real, existing shell so automation can run again, and file the wrapper's disappearance as a
   separate follow-up.
4. `sudo usermod -s /bin/bash reportbot`.
5. `su - reportbot -c 'echo ok'` now prints `ok`.

### Reasoning: why this is not `user-nologin-shell`

Both challenges present as "the account's shell is broken," but the mechanism -- and the diagnostic path --
is completely different:

- `user-nologin-shell`'s shell field is `/usr/sbin/nologin`, a real binary that is installed, executable,
  and runs successfully. It's an intentional, working lockout: it prints `This account is currently not
  available` and exits nonzero *by design*. The fix there is a policy question (should this account be
  allowed to log in at all?), and the tell is reading `nologin`'s own message.
- This challenge's shell field points at a path with **nothing there** -- `exec()` itself fails with
  `ENOENT` before any program, lockout or otherwise, ever runs. The error comes from `su`/the kernel's
  `execve()`, not from any shell. The tell is `su`'s `failed to execute ... No such file or directory`
  message, confirmed by simply checking whether the configured path exists.

Practically: a `nologin` shell is a valid, common, and often *correct* configuration for a service account
that should never get an interactive session. A shell field pointing at a binary that isn't actually on disk
is always a bug -- there's no scenario where "the configured shell doesn't exist" is the intended state.

Lesson: whenever `su`/`login` complains about being unable to execute an account's shell, check two
different things before assuming the same fix applies -- (1) does the path exist and is it executable at
all (`test -x`), and only if yes, (2) is what's there `nologin` on purpose. Fixing the wrong one (e.g.
treating a missing binary as if it were an intentional lockout) wastes time chasing a policy decision nobody
actually made.
