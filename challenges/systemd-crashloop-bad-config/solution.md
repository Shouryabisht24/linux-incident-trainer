## Solution

1. `systemctl status webapp` shows it in `activating (auto-restart)` — a crash loop driven by `Restart=always`.
2. Ask systemd *why*: `journalctl -u webapp -n 20 --no-pager` prints
   `FATAL: LISTEN_PORT must be a number, got: 'eighty'`.
3. The root cause is the config, not the unit: `/etc/webapp/webapp.conf` has `LISTEN_PORT=eighty`.
   Fix it: `sudo sed -i 's/^LISTEN_PORT=.*/LISTEN_PORT=8080/' /etc/webapp/webapp.conf`.
4. `sudo systemctl restart webapp`, then `systemctl is-active webapp` → `active`.

Lesson: a crash loop is a symptom; `journalctl -u <unit>` is where the cause is. Read the app's own error
before touching the unit file — here the unit was fine and the config was the problem. (No `daemon-reload`
was needed because we didn't change the unit; you only reload when the `.service` file itself changes.)
