## Solution

1. The crontab (`/etc/cron.d/heartbeat`) is valid, so the schedule isn't the problem.
2. Check the daemon: `pgrep -x cron` returns nothing — cron isn't running, so nothing scheduled can fire.
3. Start it: `sudo service cron start` (equivalently `sudo cron`). `pgrep -x cron` now shows it.
4. On a systemd host, use `sudo systemctl enable --now cron` so it also survives the next reboot.

Lesson: cron entries only run if the cron daemon is up. When *all* scheduled jobs go quiet at once, suspect the
daemon (`pgrep cron`, `systemctl status cron`) before combing through individual crontabs.
