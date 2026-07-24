## Solution

1. `cat /etc/logrotate.d/billing` shows it's configured to rotate `/var/log/billing/app.log`.
   `ls /var/log/billing/` shows the real file is `billing.log` -- a rename that never made it into
   the logrotate config.
2. `missingok` in the config is why this produced zero errors: logrotate is explicitly told it's
   fine if the configured path doesn't exist, so it just silently does nothing every single run,
   forever.
3. Fix the path: `sudo sed -i 's#/var/log/billing/app.log#/var/log/billing/billing.log#'
   /etc/logrotate.d/billing`.
4. Verify without waiting for the real schedule: `sudo logrotate --force /etc/logrotate.d/billing`.
   `ls /var/log/billing/` now shows `billing.log.1`, and `billing.log` itself is back to empty
   (this config uses `copytruncate`, so the original is copied then truncated in place rather than
   renamed).

Lesson: a logrotate config with `missingok` will hide a wrong path indefinitely -- there's no
error to notice, the job just runs and matches nothing, forever. Whenever a log file gets renamed
or moved, its logrotate config is exactly the kind of dependent config that's easy to forget and
has no built-in way of telling you it's now doing nothing.
