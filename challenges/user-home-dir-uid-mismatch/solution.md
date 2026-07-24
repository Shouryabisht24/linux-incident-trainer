## Solution

1. `ls -la /home/reports/data` shows the file owned by a bare number, e.g. `1050`, instead of a
   username -- `ls` couldn't resolve it to any current account, which is the first clue.
2. Check what UID `reports` actually has right now: `id reports` reports `uid=1080(reports)`.
   `1080 != 1050` -- the account and the files disagree about who "reports" is.
3. The kernel doesn't track file ownership by name at all, only by numeric UID; `ls` resolving a
   name is purely a lookup against `/etc/passwd` at display time. When the `reports` account was
   recreated (by a provisioning/restore tool that didn't pin the original UID), it came back as a
   different number, while every file it previously owned is still stamped with the old one --
   they're now two unrelated identities that happen to share a username.
4. The data is the source of truth: reassign the account's UID to match what its files are
   actually stamped with: `sudo usermod -u 1050 reports`. (No need to `chown` anything -- the
   files never changed; the account is what needs correcting.)
5. Verify: `ls -la /home/reports/data` now resolves the owner to `reports` again, and
   `sudo -u reports sh -c 'cat /home/reports/data/report.csv'` succeeds.

Lesson: Linux ownership is UID-number based, not name based -- a username is just a label looked
up from `/etc/passwd` at the moment something displays it. Recreating an account (backup restore,
new provisioning tooling, a fresh `useradd` after `userdel`) without explicitly pinning its
original UID silently orphans everything that account used to own, even though the username looks
identical and nothing about the files themselves changed.
