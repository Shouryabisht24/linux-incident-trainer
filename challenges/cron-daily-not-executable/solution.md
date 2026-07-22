## Solution

1. cron executes `/etc/cron.daily/` through `run-parts`. `run-parts --test /etc/cron.daily` lists what would
   run — and `backup` is absent, despite the file existing.
2. `run-parts` silently ignores files that aren't executable (and files whose names contain a `.`).
   `ls -l /etc/cron.daily/backup` shows `-rw-r--r--` (644) — no execute bit. That's why it never ran, and why
   it "works when you run it by hand" (`sh backup` doesn't need the bit).
3. Fix it: `sudo chmod +x /etc/cron.daily/backup`.
4. Verify: `sudo run-parts /etc/cron.daily` now creates `/var/backups/app-backup.tar`.

Lesson: scripts in `/etc/cron.daily|weekly|monthly` must be executable, or `run-parts` skips them without a
peep. Also avoid dots in the filename (`backup.sh` is ignored by default) — that trips people up constantly.
