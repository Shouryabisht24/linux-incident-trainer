## Solution

1. `df -h /var/crash` confirms the filesystem is essentially 100% full.
2. `find /var/crash -maxdepth 2 -type f` shows a large number of `run-<pid>-<timestamp>/core` files -- real
   kernel core dumps, one per crash of `render-worker`.
3. Reclaim the space right now:
   ```
   sudo rm -rf /var/crash/run-*
   ```
4. That alone isn't the fix -- the *next* crash will just start refilling it. Find what's actually producing
   these: `cat /usr/local/bin/worker-supervisor` shows it runs `ulimit -c unlimited` immediately before every
   invocation of `render-worker`, a binary that reliably segfaults. That combination is exactly what turns
   every crash into a full core dump landing on disk.
5. Fix the supervisor so core dumping is capped (effectively disabled) instead of unbounded:
   ```
   sudo sed -i 's/ulimit -c unlimited/ulimit -c 0/' /usr/local/bin/worker-supervisor
   ```
6. Verify: `df -h /var/crash` shows plenty of free space, and running `/usr/local/bin/worker-supervisor` again
   (it will still crash -- that binary is always going to segfault) leaves **no** new `core` file behind
   anywhere under `/var/crash`.

Lesson: `ulimit -c unlimited` is a completely reasonable thing to reach for while actively debugging a crash
-- you want the core file to inspect in a debugger. The mistake is leaving it in a supervisor/service wrapper
permanently, especially for something crash-prone. Unlike file permission checks, `RLIMIT_CORE` is enforced by
the kernel for root exactly the same as for any other user (decision 0007's "root bypasses everything"
caveat does not apply here), so capping it in the wrapper is a real, durable fix regardless of what user the
service runs as -- not just a today's-mess cleanup.
