## Solution

1. `sudo queue-workerctl start` says `already running (pid 31337); refusing to start`.
2. That PID isn't real: `ps -p 31337` is empty and `sudo kill -0 31337` returns *No such process*. It's a
   **stale pidfile** left by the unclean shutdown — the control script only checks that
   `/var/run/queue-worker.pid` exists, not that the process is alive.
3. Remove the stale file and start cleanly:
   `sudo rm /var/run/queue-worker.pid && sudo queue-workerctl start`.
4. `pgrep -af queue-worker` confirms it's running.

Lesson: a lingering pidfile after a crash/power-loss blocks restarts for daemons whose start logic naively
trusts the file. Verify the PID is actually alive (`kill -0`) before believing "already running"; the real
fix is a start script that treats a pidfile whose PID is dead as stale and clears it automatically.
