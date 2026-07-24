## Solution

1. Reproduce it: `logger -p local0.info 'test message'` produces no error, but
   `/var/log/app/app.log` never gets the line. rsyslog isn't crashing or refusing anything --
   it's doing precisely what it's told to.
2. `cat /etc/rsyslog.d/10-app.conf` shows the rules in effect for this facility. rsyslog evaluates
   rules top to bottom, per message:
   ```
   local0.*    /dev/null
   & stop

   local0.*    /var/log/app/app.log
   ```
3. The first rule routes every `local0` message to `/dev/null`, and `& stop` immediately halts
   further rule processing for that message -- so the second rule, the one that actually files it
   to `app.log`, never runs. This was a leftover debug rule added to quiet a noisy facility during
   an investigation and never removed.
4. Fix it: remove the `/dev/null` + `& stop` pair, leaving only the real rule:
   ```
   sudo sh -c "printf 'local0.*    /var/log/app/app.log\n' > /etc/rsyslog.d/10-app.conf"
   ```
5. rsyslog needs to be told to reload its rules. There's no systemd or init script for it in this
   environment, so restart it directly: `sudo pkill rsyslogd` followed by `sudo rsyslogd`.
6. Verify: `logger -p local0.info 'confirm fix'` followed by `tail /var/log/app/app.log` now shows
   the new line.

Lesson: a syslog/rsyslog routing rule with a `stop` action is a very deliberate short-circuit --
useful for genuinely dropping noise, but a landmine if a temporary debugging rule is left in
place, because there's no error anywhere: not in the app, not in rsyslog's own log, nothing. Rules
that match earlier and `stop` will silently swallow everything meant for rules below them.
