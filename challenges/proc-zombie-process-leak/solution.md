## Solution

1. Confirm the symptom: `ps aux | grep defunct` shows a growing number of `<defunct>` entries.
   These are zombies -- processes that have already exited; the kernel keeps a minimal record
   of each (exit status, PID) until their parent calls `wait()`/`waitpid()` on them. They use no
   CPU or memory, but each one still occupies a slot against the process-count (pids) limit until
   reaped.
2. Find their common parent: `ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/ {print $2}' | sort -u`
   returns one PID repeatedly.
3. Look at that process: `ps -p <ppid> -o pid,cmd` shows `/usr/local/bin/batch-dispatcher` --
   a loop that forks a short-lived worker on a fixed interval and never collects its exit status.
4. There's no configuration knob to fix here; the bug is the missing `wait()` in the dispatcher
   itself, so every single run of it leaks one more zombie. The correct move is to stop it:
   `sudo pkill -f /usr/local/bin/batch-dispatcher`.
5. Verify: `pgrep -f batch-dispatcher` returns nothing (or only a `<defunct>` entry for the
   dispatcher itself, which is expected -- this container's PID 1 doesn't reap either, but the
   important thing is nothing is spawning *new* zombies anymore).

Lesson: zombies are a symptom of a parent process that forks and never reaps -- the fix is never
"clean up the zombies" (you can't `rm` a process-table entry, and even `kill -9` does nothing to
an already-dead process), it's stopping whatever keeps creating them. Under a process-count
(`pids`) limit, as most containers and many modern cgroup-managed hosts run, an unbounded zombie
leak is a real path to "cannot fork" for the whole box, not just an untidy `ps` listing.
