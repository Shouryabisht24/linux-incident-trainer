## Solution

1. `systemctl status apiworker` shows the service `active` and *not* crash-looping -- this immediately rules
   out the "bad config causes the process to exit" pattern (see `systemd-crashloop-bad-config`). Something
   else is wrong while the process itself stays up.
2. `journalctl -u apiworker -n 30` shows a repeating error: `cannot open connection N/40: Too many open
   files`. That's `EMFILE` -- a process-level file-descriptor ceiling, not a code bug or a real leak: the app
   is trying to open exactly the 40 connections it's supposed to hold at steady state, and failing partway.
3. Find the real PID and compare its enforced limit against its actual usage:
   `systemctl show apiworker --property=MainPID` -> PID, then `cat /proc/<pid>/limits | grep 'open files'`
   (shows `Max open files`) and `ls /proc/<pid>/fd | wc -l` (current count). The count is pinned right at
   the limit.
4. Unlike `proc-fd-leak-too-many-open-files` (where the app's own config file drove a `ulimit -n` in a
   hand-rolled control script), this ceiling comes straight from systemd's own resource-limit directive:
   `systemctl cat apiworker` shows `LimitNOFILE=30` under `[Service]`. A "hardening pass" set this -- 30 was
   never enough for a service that legitimately needs 40 simultaneous connections plus stdio/libc overhead.
   This is a pure *configuration ceiling* bug: the application code has no leak at all.
5. Fix it in the unit: `sudo systemctl edit --full apiworker` (or edit
   `/etc/systemd/system/apiworker.service` directly) and raise `LimitNOFILE` to something generously above
   the real need, e.g. `4096`.
6. **Reload and restart are both required** -- `daemon-reload` so systemd re-reads the changed unit file, and
   `restart` because an already-running process's resource limits are fixed at the moment it was `exec`'d;
   editing the unit does nothing to a process already running under the old limit.
   `sudo systemctl daemon-reload && sudo systemctl restart apiworker`.
7. Verify: `systemctl is-active apiworker` reports `active`, and `ls /proc/$(systemctl show apiworker
   --property=MainPID --value)/fd | wc -l` shows 40 (or more).

Lesson: "too many open files" with a service that's otherwise healthy and not crash-looping usually means a
`LimitNOFILE=` ceiling set in the unit itself, not an application leak -- `systemctl cat <unit>` (or
`systemctl show <unit> --property=LimitNOFILE`) tells you the configured ceiling directly, no need to guess
from `ulimit` alone. And, as always with resource limits: a config change only takes effect for the *next*
process systemd starts, never the one already running.
