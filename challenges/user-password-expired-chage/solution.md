## Solution

1. `su - backupsvc -c 'echo ok'` fails, printing:
   ```
   You are required to change your password immediately (administrator enforced).
   Current password: su: Authentication token manipulation error
   Changing password for backupsvc.
   ```
   Note this is real, enforced PAM account-management behavior -- it fires even though **root** is the one
   invoking `su`. Root's usual "I can do anything" doesn't apply here because this isn't a DAC permission
   check; it's `pam_unix`'s account phase deciding a new password is mandatory before a session can start at
   all, and there's no terminal attached to actually supply one.
2. `sudo chage -l backupsvc` shows:
   ```
   Last password change      : password must be changed
   Password expires          : password must be changed
   ...
   Maximum number of days between password change : 99999
   ```
   `Maximum number of days` is still the (harmless) shadow default -- this is **not** a max-age policy that
   quietly crept past its limit. `Last password change` reading `password must be changed` instead of an
   actual date is the tell: shadow treats a last-changed date of `0` as a hard sentinel meaning "force a
   change right now," independent of whatever the max-days policy says.
3. A tempting first attempt -- `sudo chage -M -1 backupsvc` (disable max-age entirely) -- does **not** fix
   this. Confirmed directly: it changes the max-days field but leaves `Last password change` at the `0`
   sentinel, and `su - backupsvc -c 'echo ok'` still fails with the exact same prompt. The sentinel itself,
   not the policy around it, is what's forcing the immediate change.
4. The actual fix is to clear the sentinel: `sudo chage -d $(date +%Y-%m-%d) backupsvc` sets the
   last-changed date to a real, current date.
5. Verify: `sudo chage -l backupsvc` now shows a real date under `Last password change`, and
   `su - backupsvc -c 'echo ok'` succeeds.

### Reasoning: why this is not `user-account-locked`

Both challenges are chage-adjacent and both present as "the account can't be used," but they're enforcing
two different fields with two different real-world causes:

- `user-account-locked` sets `chage -E <past-date>` -- the account itself has a hard **expiry** date that
  has passed. `su`'s message there is `Your account has expired`. The fix is to clear or push out the
  expiry date (`chage -E -1`).
- This challenge never touches the account expiry field at all (`Account expires: never` the whole time).
  It's the **password-aging** last-changed date that's forcing a mandatory, immediate change -- a state
  that's perfectly normal and expected for a human account on its first login, but breaks any
  service account that's invoked non-interactively and can never actually type a new password when
  prompted.

Lesson: a blanket password-aging policy rollout is a common, real operational mistake when it isn't scoped
to exclude service accounts. `chage -l`/`passwd -S` distinguish cleanly between "the account has expired"
(`-E`) and "the password must be changed" (`-d 0`, or a genuinely stale last-changed date past `-M`'s
window) -- read the specific field before reaching for a fix, since disabling the wrong one
(e.g. `-M -1` alone) can look like progress in `chage -l`'s output while leaving the actual blocker
untouched.
