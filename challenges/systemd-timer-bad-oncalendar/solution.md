## Solution

1. `systemctl status cleanup.timer` shows it failed to activate: `Failed to start cleanup.timer:
   Invalid argument`.
2. `cat /etc/systemd/system/cleanup.timer` shows `OnCalendar=daily at 3am` -- that's not systemd's
   calendar-event syntax, it's plain English, and systemd can't parse it at all.
3. systemd calendar expressions follow a specific grammar:
   `Weekday YYYY-MM-DD HH:MM:SS`, where each field can be `*` for "any". Daily at 3am is
   `OnCalendar=*-*-* 03:00:00`. You can sanity-check any expression before committing to it:
   `systemd-analyze calendar '*-*-* 03:00:00'` prints the next few times it would actually fire.
4. Fix the unit: `sudo sed -i 's/OnCalendar=daily at 3am/OnCalendar=*-*-* 03:00:00/'
   /etc/systemd/system/cleanup.timer`.
5. Reload and restart the timer (an edited unit file, and a timer that previously failed to
   activate, both need this): `sudo systemctl daemon-reload && sudo systemctl restart
   cleanup.timer`.
6. Verify: `systemctl list-timers cleanup.timer` (or `systemctl status cleanup.timer`) now shows a
   real `NEXT` trigger time instead of a parse failure.

Lesson: `OnCalendar=` is a specific, strict grammar, not free text -- systemd will not guess what
you meant, it just refuses to activate the unit. `systemd-analyze calendar '<expr>'` is the fast
way to validate a calendar expression before it ends up silently broken in production, since
(unlike a typo in `ExecStart`) a bad schedule often isn't noticed until someone realizes a job
simply never ran.
