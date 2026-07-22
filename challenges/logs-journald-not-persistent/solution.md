## Solution

1. `cat /etc/systemd/journald.conf.d/*.conf` shows `Storage=volatile` — journald keeps logs only in `/run`
   (RAM), so they're lost on reboot.
2. Persistent logging needs two things: `Storage=persistent` (or `auto`) **and** the directory
   `/var/log/journal` to exist.
   - Edit `/etc/systemd/journald.conf.d/volatile.conf` and set `Storage=persistent`.
   - `sudo mkdir -p /var/log/journal`
3. Apply and flush the current in-memory logs to disk:
   `sudo systemctl restart systemd-journald && sudo journalctl --flush`
4. Verify: `ls -R /var/log/journal` shows `<machine-id>/system.journal`; `journalctl --header` now points there.

Lesson: journald persistence requires the `/var/log/journal` directory to exist — with the default
`Storage=auto`, journald only persists if that directory is present. After enabling it, `journalctl --flush`
migrates the volatile `/run` journal onto disk immediately (otherwise it happens on the next boot's
`systemd-journal-flush.service`).
