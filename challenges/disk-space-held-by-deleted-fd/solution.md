## Solution

1. Confirm the classic symptom: `df -h /var/log/streamer` reports the filesystem nearly full, but
   `du -sh /var/log/streamer` and `ls -la /var/log/streamer` show almost nothing. That mismatch is
   the signature of a deleted-but-still-open file: once unlinked, a file vanishes from every
   directory listing, but the kernel can't actually free its blocks until every process that has
   it open closes its file descriptor.
2. Find the culprit: `sudo lsof +L1 /var/log/streamer` lists open files on that filesystem with a
   link count of 0 (deleted). It shows the `streamer` process still holding a large deleted file
   open (`(deleted)` in the `NAME` column).
3. The real-world root cause: a log-rotation step removed the log file directly instead of either
   using `copytruncate` or signalling the process (`HUP`/`USR1`) to close and reopen its log --
   so `streamer` kept its original file descriptor and kept the space allocated.
4. Stop the process holding it open: `sudo pkill -f /usr/local/bin/streamer` (or `sudo kill <pid>`
   using the PID from the `lsof` output). The moment its last reference to the file closes, the
   kernel reclaims the blocks.
5. Verify: `df -h /var/log/streamer` now shows the space back.

Lesson: "no space left" with nothing visible to delete almost always means a deleted-but-open
file descriptor, not a haunted filesystem. `lsof +L1 <path>` (or `lsof | grep deleted`) is the
tool for exactly this. It's also why log rotation tools support `copytruncate` or a post-rotate
reload hook -- so the writing process never ends up holding a reference to an unlinked file in
the first place.
