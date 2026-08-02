## Solution

1. Reproduce the failure as the real actor: `sudo -u collector nc -U /run/metricsd/metricsd.sock`
   fails with `Permission denied`. Confirm the daemon itself is genuinely healthy first --
   `pgrep -f metricsd-daemon.sh` shows it running, and connecting as root/trainee
   (`sudo nc -U /run/metricsd/metricsd.sock`) succeeds and prints `METRICSD_HELLO`. Same socket,
   different outcome depending entirely on who's connecting -- this is a permissions problem, not
   a daemon-health problem.
2. A Unix domain socket's `connect()` is gated by ordinary DAC permission checks on its own
   filesystem path, exactly like opening a regular file. `ls -l /run/metricsd/metricsd.sock` shows
   `srwxrwx--- 1 metricsd metricsd ...` -- group-owned by `metricsd`, mode `770` (no access for
   "other" at all). `id collector` shows it's a member of `metrics-clients` -- a completely
   different group from the one that actually owns the socket.
3. Fix what's live right now:
   ```
   sudo chgrp metrics-clients /run/metricsd/metricsd.sock
   ```
   Verify as the real user again: `sudo -u collector nc -U /run/metricsd/metricsd.sock` now
   connects and prints `METRICSD_HELLO`.
4. That only fixes the *current* socket file, though. Look at where it came from:
   `ls -ld /run/metricsd` shows a plain directory owned `metricsd:metricsd`, mode `755`, with no
   setgid bit. Every time the daemon (re)creates its socket there -- which it does on every single
   connection cycle, since this minimal daemon handles one client per `nc -lU` invocation and
   loops -- the fresh socket inherits the *creating process's own primary group* (`metricsd`),
   never `metrics-clients`, no matter how many times it restarts. Left alone, this exact same
   incident recurs the next time the daemon restarts and rebinds.
5. Fix the actual source of the problem, the directory itself, so it doesn't come back:
   ```
   sudo chgrp metrics-clients /run/metricsd
   sudo chmod g+s /run/metricsd
   ```
   `ls -ld /run/metricsd` now shows `drwxrwsr-x ... metricsd metrics-clients` -- the `s` in the
   group-execute position is the setgid bit. From now on, *any* file or socket created inside
   `/run/metricsd` automatically inherits `metrics-clients` as its group, regardless of which
   account's process creates it -- so the fix survives every future restart of the daemon, not
   just the currently-running socket.

Lesson: Unix domain sockets are files, and normal ownership/permission rules apply to them exactly
as they do to any other filesystem object -- a "the service is up but a legitimate client still
can't reach it" report is very often a socket (or directory) permissions problem, not an
application bug. And because sockets (like log files, PID files, or spool files) are frequently
recreated by the very daemon that owns them, a fix aimed at the file itself is often a fix that
silently expires the next time the daemon restarts -- the durable fix targets whatever is
responsible for the *new* file's ownership each time, which for a directory of freshly-created
objects is exactly what the setgid bit is for.
