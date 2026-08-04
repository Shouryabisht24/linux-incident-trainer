## Solution

1. `sudo systemctl status webapp` shows `failed`. Because `Restart=no`, it isn't crash-looping -- it died once
   and just stayed dead. `sudo journalctl -u webapp -n 20 --no-pager` shows the app's own reason:
   `FATAL: /var/lib/app/ready missing -- data-init hasn't completed yet`.
2. That marker file, `/var/lib/app/ready`, is created by a different unit: `sudo systemctl cat data-init.service`
   shows a `Type=oneshot`, `RemainAfterExit=yes` service whose `ExecStart` sleeps briefly (simulating real
   provisioning work) before touching the marker.
3. Check whether `webapp.service` actually depends on it: `sudo systemctl show webapp -p After -p Requires` shows
   neither directive mentions `data-init.service`. Both units are pulled in by `multi-user.target`, and with
   no explicit ordering between them, systemd is free to start them in parallel at boot. `webapp`'s own
   `ExecStart` runs almost instantly and checks for the marker file the moment it's invoked -- long before
   `data-init` has had time to finish -- so it reliably loses the race on every clean boot.
4. This is why a manual `sudo systemctl restart webapp` "fixes" it every time you try it live: by the time
   you notice the problem and restart, `data-init.service` finished seconds ago and the marker already
   exists. That's a false signal -- the *ordering* is still broken, it's just not being exercised anymore.
5. The real fix is in the unit file, not a restart: edit `/etc/systemd/system/webapp.service`'s `[Unit]`
   section to add both
   ```
   Requires=data-init.service
   After=data-init.service
   ```
   `Requires=` makes starting `webapp.service` also pull in `data-init.service` if it isn't already running;
   `After=` ensures `webapp.service` isn't even invoked until `data-init.service` reports itself active. Both
   are needed -- `Requires=` alone doesn't guarantee ordering, and `After=` alone doesn't guarantee the
   dependency gets started at all.
6. `sudo systemctl daemon-reload` to pick up the edited unit, then confirm the dependency is really there:
   `sudo systemctl show webapp -p After -p Requires` should list `data-init.service` in both.
7. Prove it holds under a real race, not just a lucky restart: stop both units, remove the marker, and start
   webapp cold:
   ```
   sudo systemctl stop webapp data-init
   sudo rm -f /var/lib/app/ready
   sudo systemctl start webapp
   sudo systemctl is-active webapp
   ```
   With the dependency in place, starting `webapp.service` automatically starts `data-init.service` first and
   waits for it to finish before running webapp's own `ExecStart` -- so this now reliably reports `active`.

Lesson: a crash that "goes away" the moment you touch it by hand is a classic symptom of a boot-ordering bug,
not evidence the unit is fine. `After=`/`Requires=` are the only things that make systemd wait for a real
dependency instead of racing it -- and the only trustworthy way to confirm the fix is to replay the actual
race (stop everything, clear state, start cold), not to restart a system that's already past the danger
window.
