## Solution

1. `top` (Shift+P to sort by CPU) or `ps -eo pid,pcpu,comm --sort=-pcpu | head` shows `report-generator`
   pinned near 100%.
2. Get its PID: `pgrep -af report-generator`.
3. Kill it: `sudo pkill -f report-generator`. Prefer a normal `SIGTERM` first; only escalate to
   `kill -9` (SIGKILL) if it ignores TERM.
4. `top` now shows the CPU idle.

Lesson: for CPU saturation, sort processes by `%CPU` (`top`/`ps --sort=-pcpu`) to find the offender fast.
A single busy loop can starve a small box; the durable fix is in the offending program (add a sleep/backoff),
but stopping the stuck process restores service immediately.
