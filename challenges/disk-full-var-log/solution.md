## Solution

1. `df -h /var/log/app` confirms the filesystem is ~100% full.
2. Find the culprit: `sudo du -ah /var/log/app | sort -h | tail` shows `debug.log` is eating almost all of it.
3. Free the space. Prefer truncation over deletion so a process that still holds the file open keeps its
   descriptor valid (deleting an open file doesn't return the space until the process closes it):
   `sudo truncate -s 0 /var/log/app/debug.log`
4. Verify with `df -h /var/log/app` — plenty of free space now.

Lesson: `rm` on a log a daemon still has open does **not** free space until that process restarts or closes
the file (`lsof` will show it as `(deleted)`). `truncate -s 0` frees it immediately and is the safer habit.
The real long-term fix is turning debug logging off and adding log rotation.
