## Solution

1. `sudo systemctl start nginx` fails: `Failed to start nginx.service: Unit nginx.service is masked.`
2. `systemctl status nginx` shows `Loaded: masked (/dev/null; ...)`. Masking is stronger than disabling —
   the unit is symlinked to `/dev/null` so it can't be started manually *or* automatically.
   `ls -l /etc/systemd/system/nginx.service` confirms the `-> /dev/null` symlink.
3. Undo it and start the service: `sudo systemctl unmask nginx && sudo systemctl start nginx`.
4. `systemctl is-active nginx` → `active`.

Lesson: `disabled` just stops auto-start at boot; `masked` blocks starting entirely. If `systemctl start`
insists a unit "is masked," `systemctl unmask` is the fix — not editing unit files.
