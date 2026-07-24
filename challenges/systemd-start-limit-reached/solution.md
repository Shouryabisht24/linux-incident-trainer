## Solution

1. `systemctl start worker2` refuses immediately with `start request repeated too quickly` --
   this is systemd's own start-rate limiter (`StartLimitIntervalSec`/`StartLimitBurst` in the
   unit), not a fresh crash. It fires after the service failed and restarted too many times in
   too short a window.
2. Find out what actually crashed it in the first place: `journalctl -u worker2 -n 30 --no-pager`
   shows repeated `FATAL: missing /etc/worker2/worker2.conf` right before each restart.
3. Fix the real, underlying bug: create the missing config.
   ```
   sudo mkdir -p /etc/worker2
   printf 'QUEUE_NAME=default\n' | sudo tee /etc/worker2/worker2.conf
   ```
4. That alone is not enough -- the unit is latched in a failed, start-limited state, and
   `systemctl start` will keep refusing until that's explicitly cleared:
   `sudo systemctl reset-failed worker2`.
5. Now start it: `sudo systemctl start worker2`.
6. Verify: `systemctl is-active worker2` reports `active`.

Lesson: `Restart=` policies plus `StartLimitBurst`/`StartLimitIntervalSec` are a safety valve --
once a unit fails enough times fast enough, systemd deliberately stops trying, *even after you fix
the real cause*, until you tell it the failure has been dealt with via `systemctl reset-failed`.
Fixing the underlying bug without also clearing the start-limit state is one of the most common
"I fixed it but it still won't start" traps with systemd.
