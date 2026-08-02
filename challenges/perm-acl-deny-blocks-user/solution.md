## Solution

1. Reproduce the failure as the real actor: `sudo -u etl cat /var/data/exports/customer_export.csv`
   fails with `Permission denied`.
2. Check the obvious thing first: `ls -l /var/data/exports/customer_export.csv` shows
   `-rw-r--r-- 1 root root ...` -- world-readable. By the normal owner/group/other model, `etl`
   should have no trouble reading this at all. But look closely at the mode string: there's a `+`
   immediately after it (`-rw-r--r--+`). That `+` is `ls`'s way of flagging "there's more to this
   file's access control than what you're looking at" -- a POSIX ACL.
3. Inspect the ACL directly: `getfacl /var/data/exports/customer_export.csv` shows:
   ```
   # file: var/data/exports/customer_export.csv
   # owner: root
   # group: root
   user::rw-
   user:etl:---
   group::r--
   mask::rw-
   other::r--
   ```
   The `user:etl:---` line is a **named-user ACL entry** -- it applies specifically to the `etl`
   account and takes precedence over the `group`/`other` entries for that one UID, regardless of
   how permissive those other entries are. That's the entire mechanism: someone locked one
   specific account out of this file without ever touching its normal permission bits, which is
   exactly why `ls -l`'s mode string alone told an incomplete story.
4. Fix it -- either remove the stale entry entirely:
   ```
   sudo setfacl -x u:etl /var/data/exports/customer_export.csv
   ```
   or grant it explicitly:
   ```
   sudo setfacl -m u:etl:r-- /var/data/exports/customer_export.csv
   ```
   Confirm with `getfacl` -- the `user:etl:` line should now be gone (or read `r--`), and the
   trailing `+` disappears from `ls -l` if there are no more extra entries.
5. Verify as the real user again: `sudo -u etl cat /var/data/exports/customer_export.csv` now
   prints the file's contents.

Lesson: POSIX ACLs let you layer much finer-grained rules (specific users, specific groups) on top
of the classic owner/group/other model, and a named-user entry always wins for that user over
whatever the group/other bits say -- including a *deny*. That's powerful for surgically locking
out one account (e.g. an offboarded contractor) without touching a file's normal permissions for
everyone else, but it also means `ls -l`'s permission string is no longer the whole truth once a
`+` shows up -- and a stale ACL entry aimed at the wrong account name (or an old account whose
name later got reused) can quietly break a completely unrelated, legitimate process. Always
`getfacl` before trusting `ls -l` alone when permissions "look right" but access still fails.
