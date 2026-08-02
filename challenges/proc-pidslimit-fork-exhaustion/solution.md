## Solution

1. Confirm this is really a hard ceiling, not a vague "lots of processes" feeling:
   `cat /sys/fs/cgroup/pids.current` vs `cat /sys/fs/cgroup/pids.max`. Current sits right up near max --
   this container's `pids` cgroup is genuinely almost out of room to create any new process at all, including
   your own next command.
2. Find what's still trying to grow the pool: `cat /var/run/pool-supervisor.pid` gives its PID; its log
   (`cat /var/log/pool-supervisor.log`) shows it logging "no headroom left ... will retry later" on a loop --
   it never gives up permanently, it just backs off and tries again.
3. Stop it: `sudo kill -9 $(cat /var/run/pool-supervisor.pid)`. This stops the leak from growing further, but
   **does not** free up the pid slots already spent -- every `job-worker` it already spawned is still alive,
   still holding a slot, and stopping the supervisor alone leaves `pids.current` exactly where it was.
4. Clean up what's already leaked. Don't try to hunt these down by process name: each `job-worker` execs
   into `sleep infinity`, so its `comm`/`ps` name is just `sleep` -- indistinguishable by name from any other
   `sleep` process on the box, and a name-based `pkill` here is exactly the kind of imprecise match that can
   go wrong. Instead, use the supervisor's own record of what it spawned:
   `for p in $(cat /var/run/worker-pool/pids); do sudo kill -9 "$p"; done`.
5. Verify: `cat /sys/fs/cgroup/pids.current` now reads a small number, comfortably clear of `pids.max` --
   real headroom is back, and with the supervisor gone, nothing is trying to consume it again.

One thing worth understanding about *why* this specific box's cleanup step actually works: a process
`kill -9`'d without anything ever calling `wait()`/`waitpid()` on it becomes a permanent zombie
(`<defunct>`) -- and a zombie **still counts against a `pids` cgroup's current count** until it's reaped;
it isn't a free slot just because the process is "dead". Most of this repo's other process challenges don't
need to worry about that (their PID 1 is a bare `sleep infinity` that never reaps, but the fix there is just
"stop the one offending process", not "recover cgroup headroom"). This challenge's container runs a small
reap loop as PID 1 specifically so that killing the leaked workers actually frees their pid slots, the way a
real host's init process (or `docker run --init`) would.

Lesson: `pids.max`/`pids.current` (readable directly from `/sys/fs/cgroup/`) are the ground truth for "is
this box about to lose the ability to fork anything" -- far more reliable than eyeballing `ps` output. And
when a runaway *spawner* is involved, killing the spawner is only half the fix; anything it already spawned
keeps consuming the resource until it's cleaned up too.
