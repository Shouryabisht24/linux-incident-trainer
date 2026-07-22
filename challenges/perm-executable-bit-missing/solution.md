## Solution

1. Reproduce as the account that runs it: `sudo -u monitor /usr/local/bin/healthcheck` → `Permission denied`.
2. `ls -l /usr/local/bin/healthcheck` shows `-rw-r--r--` (644) — no execute bit at all.
3. Add execute permission: `sudo chmod +x /usr/local/bin/healthcheck` (now `755`).
4. Verify: `sudo -u monitor /usr/local/bin/healthcheck` prints `OK`.

Lesson: the execute bit is the one DAC permission root does **not** freely bypass — `execve()` on a file with
no `x` bit fails even for root. "Permission denied" when *running* a file (vs. reading it) almost always means
a missing `chmod +x`. Config-management tools that "normalise" modes to 644 are a classic cause.
