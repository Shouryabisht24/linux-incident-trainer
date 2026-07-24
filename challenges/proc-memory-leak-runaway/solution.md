## Solution

1. Spot the growth: `ps aux --sort=-%mem | head` shows `cache-warmer` near the top; running the
   same command again a few seconds later shows its RSS has grown further, while every other
   process stayed flat -- the signature of a genuine leak, not just one process that happens to
   use a lot of memory.
2. There's nothing to "wait out" here -- it allocates and never frees, so left alone it will keep
   growing until the container's memory limit kills something (possibly not even the leaking
   process itself, depending on what the kernel's OOM killer picks).
3. Stop it: `sudo pkill -f cache-warmer`.
4. Verify: `pgrep -f cache-warmer` returns nothing, and `free -m` / repeated `ps` checks show
   memory usage has stopped climbing.

Lesson: a genuine memory leak looks different from a process that's just legitimately using a lot
of RAM -- check the *trend* (sample twice), not just a single snapshot. Under a hard memory limit
(as most containers and many production hosts run), a leak isn't a slow-burn annoyance, it's a
countdown to something getting OOM-killed, possibly a completely unrelated process if the kernel's
OOM killer doesn't pick the actual offender.
