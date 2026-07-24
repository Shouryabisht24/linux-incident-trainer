## Solution

1. The error already names a PID: `Could not get lock /var/lib/dpkg/lock-frontend. It is held by
   process <pid>`. Confirm it directly: `sudo fuser -v /var/lib/dpkg/lock-frontend` (or `sudo lsof
   /var/lib/dpkg/lock-frontend`) lists the process(es) currently holding that file open.
2. Before touching anything, check what that process actually is:
   `ps -p <pid> -o pid,etime,cmd`. If it's genuinely still doing package work, killing it could
   leave dpkg's database half-written. Here it's clearly a hung leftover from an interrupted
   maintenance window -- not actively doing anything.
3. Clear it: `sudo fuser -k /var/lib/dpkg/lock-frontend` signals every process currently holding
   that file (there can be more than one PID involved, since a child process can inherit the same
   open file descriptor from its parent -- killing only one of them may not be enough).
4. Verify the lock is genuinely free, not just that the file is gone: try acquiring it fresh
   (`flock -n -x /var/lib/dpkg/lock-frontend -c true` should succeed), or simply run
   `sudo dpkg --configure -a`, which now proceeds instead of refusing.

Lesson: dpkg's lock is a real, kernel-level advisory lock (`flock`) held by a live process --
not just a file whose mere presence blocks things. Deleting the lock *file* while the original
process is still alive and holding it does not release the lock (a new process opening the freshly
recreated file gets an entirely separate lock from the one the old process still holds), and it
also does not indicate anything is wrong if nothing is holding it. Always identify and confirm the
actual holding process (`fuser`/`lsof`) before assuming a "stuck lock file" needs deleting.
