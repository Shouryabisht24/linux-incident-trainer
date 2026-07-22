## Solution

1. Reproduce as the account the app uses, not as root:
   `sudo -u billing cat /etc/billing/billing.conf` → `Permission denied`.
2. `ls -l /etc/billing/billing.conf` shows `-rw------- root root` (600) — only root can read it.
3. Make it readable by the `billing` user **without** making the secret world-readable
   (avoid `chmod 644`). Best options:
   - `sudo chown billing /etc/billing/billing.conf` (still 600, now the owner is `billing`), or
   - `sudo chgrp billing /etc/billing/billing.conf && sudo chmod 640 ...`
4. Verify: `sudo -u billing cat /etc/billing/billing.conf` now prints the file.

Lesson: fixing "permission denied" isn't always `chmod 644`. A secrets file should stay
unreadable to "other" — scope the grant to exactly the account that needs it.
