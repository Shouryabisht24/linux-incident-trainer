## Solution

1. `reportd-log hello` then `cat /var/log/reportd/reportd.log` -- the `cat` itself fails with "No such file or
   directory", even though `ls /var/log/reportd/` clearly lists `reportd.log`.
2. `ls -l /var/log/reportd/reportd.log` shows it's a **symlink**, pointing at
   `/var/log/reportd-archive/2026-06-01.log`. `ls -ld /var/log/reportd-archive` shows that directory doesn't
   exist at all.
3. **REASONING**: this is a different failure mode from a symlink pointed at `/dev/null`
   (`logs-app-log-devnull`). There, every write always succeeds (silently discarded). Here, because the
   symlink's *target directory* is entirely missing, the `open()` call needed to append to it fails outright
   with `ENOENT` -- there's nowhere for the file to even be created. reportd's logging wrapper is written to
   swallow that error (`2>/dev/null`) rather than crash the app over a logging hiccup -- a common, reasonable
   pattern in real fire-and-forget loggers -- which means every single write vanishes with zero visible
   complaint anywhere. `/var/log/reportd-archive` was very likely a separate log-archive mount or volume that
   got decommissioned or unmounted without anyone updating (or removing) the symlink that still points into it.
4. Fix it -- either restore the original intent by recreating the missing directory:
   ```
   sudo mkdir -p /var/log/reportd-archive
   sudo touch /var/log/reportd/reportd.log   # now resolves through the symlink and creates the target
   ```
   or, simpler, stop depending on that old archive path entirely and just make the log a real file directly:
   ```
   sudo rm /var/log/reportd/reportd.log
   sudo touch /var/log/reportd/reportd.log
   ```
5. Verify: `reportd-log test && cat /var/log/reportd/reportd.log` now shows the line.

Lesson: an always-empty log isn't always a symlink to `/dev/null` -- it can just as easily be a symlink to a
path that no longer exists at all, especially after storage gets reorganized (an old archive mount removed, a
log directory renamed) and nobody chased down every symlink pointing into it. Combine that with a logger that
swallows write errors (reasonable on its own, so the app doesn't crash over a logging failure) and the result
is total, silent data loss with no error anywhere to point you at the cause -- `ls -l` on the destination is
the first thing to check whenever a log file "exists" but never seems to receive anything.
