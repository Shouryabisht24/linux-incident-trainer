## Solution

1. `systemctl status nightly-reconcile.timer` shows it `inactive (dead)` and disabled -- consistent
   with "it was turned off for a maintenance freeze." Re-enabling it is the obvious first move:
   ```
   sudo systemctl enable --now nightly-reconcile.timer
   ```
   It comes up `active`, but `/var/lib/app/last-reconcile` still doesn't appear.
2. The schedule itself isn't the problem -- `OnCalendar=*-*-* 02:00:00` is perfectly valid syntax and
   `systemctl show nightly-reconcile.timer -p NextElapseUSecRealtime` shows a sane next run time
   (tomorrow at 02:00). The question is what happens to the occurrences that were missed *while the
   timer was off*, not what happens next.
3. `systemctl show nightly-reconcile.timer -p Persistent` reports `Persistent=no`. That's the whole
   bug: a non-persistent timer has no memory of "I should have fired while I was inactive" -- the
   moment you re-enable it, it just starts counting toward the *next* natural occurrence and silently
   drops anything it missed. Three days of nightly runs are gone for good under this setting, even
   though the timer is now technically "working."
4. Fix it by adding `Persistent=true` under `[Timer]` in `/etc/systemd/system/nightly-reconcile.timer`:
   ```ini
   [Timer]
   OnCalendar=*-*-* 02:00:00
   Persistent=true
   Unit=nightly-reconcile.service
   ```
   (`sudo nano /etc/systemd/system/nightly-reconcile.timer`, or a `sed -i` insert under `[Timer]`,
   both work.)
5. Reload and re-enable so systemd picks up the change and re-evaluates:
   ```
   sudo systemctl daemon-reload
   sudo systemctl enable --now nightly-reconcile.timer
   ```
   Because at least one scheduled 02:00 occurrence was genuinely missed while the timer was
   inactive, systemd immediately fires `nightly-reconcile.service` to catch up -- `/var/lib/app/last-reconcile`
   now exists with a fresh timestamp, stamped the moment the timer was reactivated rather than at the
   next real 02:00.

Lesson: `Persistent=` is systemd's opt-in for "catch up on what I missed while I was off" -- it is
**not** the default, and a timer's `OnCalendar=` schedule being perfectly valid tells you nothing about
whether a missed occurrence gets made up. Systemd tracks each persistent timer's last real trigger in
a small stamp file under `/var/lib/systemd/timers/`; on activation, it compares that against the
calendar expression and, if `Persistent=true`, fires immediately for any occurrence that fell inside
the downtime window. Any timer standing in for a job that must run at least once per period (backups,
reconciliation, invoicing) needs `Persistent=true` specifically because the box it runs on won't
always be up, enabled, or free of maintenance windows at the exact moment the schedule says it should
fire.
