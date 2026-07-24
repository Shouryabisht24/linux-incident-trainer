## Solution

1. Reproduce it: `su - etl -c 'echo ok'` prints `Your account has expired; please contact your
   system administrator.` and fails. That specific wording points at account *expiry*, not a bad
   password or a locked password.
2. Check the account's aging settings: `sudo chage -l etl` shows an `Account expires` date back in
   1970 -- long past.
3. This is a distinct setting from the password itself: `passwd -l` (a password lock) blocks
   password-based logins but does **not** block `su` when invoked by root, since root doesn't need
   to supply a password. Account *expiry* (`chage -E`) is checked separately and blocks the account
   outright, for anyone, including root running `su`.
4. Clear it: `sudo chage -E -1 etl` (`-1` means the account never expires).
5. Verify: `sudo chage -l etl` now shows `Account expires: never`, and `su - etl -c 'echo ok'`
   succeeds.

Lesson: "account expired" and "password locked" are two different mechanisms with different
messages and different enforcement -- a locked password (`passwd -l`/`usermod -L`) is bypassable by
root via `su`, but an expired account (`chage -E`) is not. An onboarding script that sets an
expiry date meant for temporary/contractor accounts is a common way for a service account to
silently pick up an expiry nobody intended for it.
