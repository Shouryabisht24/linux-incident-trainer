## Solution

1. `systemctl status reportd` shows the unit failed with `status=217/USER`. That code is
   specific: systemd tried to switch to the configured `User=` before even exec-ing the program,
   and couldn't -- the account doesn't exist. This fails earlier than a normal crash (`ExecStart`
   never runs at all).
2. Check the unit file: `cat /etc/systemd/system/reportd.service` shows `User=reportgen`.
   Check what accounts actually exist: `getent passwd | grep report` shows `reportsvc`, not
   `reportgen` -- the account was renamed during a security review and the unit was never updated.
3. Fix the unit: `sudo sed -i 's/User=reportgen/User=reportsvc/' /etc/systemd/system/reportd.service`.
4. Reload systemd's view of unit files (it caches them; an edited unit file does nothing until
   reloaded) and start the service:
   ```
   sudo systemctl daemon-reload
   sudo systemctl start reportd
   ```
5. Verify: `systemctl is-active reportd` reports `active`.

Lesson: `status=217/USER` (and its neighbors, like `203/EXEC` for a bad `ExecStart` path) are
systemd's own pre-flight failures -- they happen before your program ever runs, so `journalctl -u
<service>` won't show anything from the app itself, only systemd's own error. Renaming or removing
service accounts is exactly the kind of change that's easy to do everywhere except the one unit
file that references the old name.
