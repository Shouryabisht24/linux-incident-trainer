## Solution

1. `tail /var/log/connd/connd.log` shows a repeating error: `cannot open connection N/25: Too many
   open files`. That's `EMFILE` -- a process-level file-descriptor limit, not a disk or networking
   fault.
2. Find the process and compare its actual limit against its actual usage:
   `pgrep -f connd` -> PID, then `cat /proc/<pid>/limits | grep 'open files'` (shows the soft/hard
   `Max open files`) and `ls /proc/<pid>/fd | wc -l` (shows how many it's currently holding). The
   usage is pinned right at the limit.
3. The limit is applied from `/etc/connd/connd.conf`'s `NOFILE_LIMIT`, via `ulimit -n`, when the
   service's control script starts it (`/usr/local/bin/svc-ctl`). It was set to `20` during a
   hardening pass -- far below the 25 simultaneous connections this service is meant to hold, plus
   a few descriptors for its own stdio/logging.
4. Fix the config: `sudo sed -i 's/NOFILE_LIMIT=20/NOFILE_LIMIT=256/' /etc/connd/connd.conf`.
5. **Restart is required** -- an already-running process's `ulimit` doesn't change just because the
   config file did; the limit is only applied at the moment the process starts.
   `sudo svc-ctl restart`.
6. Verify: `pgrep -f connd` for the new PID, then `ls /proc/<pid>/fd | wc -l` shows 25 (or more)
   open descriptors, and the log stops accumulating new errors.

Lesson: "too many open files" almost always means a process-level `ulimit -n`, not a
system-wide problem -- check `/proc/<pid>/limits` for the actual process before assuming the whole
box is out of descriptors. And configuration changes to a resource limit only take effect for
processes started *after* the change; an already-running process keeps whatever limit it was
launched with.
