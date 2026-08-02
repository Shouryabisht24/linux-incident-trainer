## Solution

1. Reproduce it: `shipnotify-log 'test message'` produces no error, but `/var/log/shipnotify/shipnotify.log`
   never gets the line. `cat /etc/rsyslog.d/25-shipnotify.conf` shows the dedicated rule for this app:
   ```
   local3.*    /var/log/shipnotify/shipnotify.log
   ```
   That rule looks completely correct -- no `/dev/null`, no `stop`, nothing suspicious. Nobody sabotaged
   anything here.
2. Since the rule is fine, check whether `shipnotify` is actually sending on the facility that rule matches:
   `cat /usr/local/bin/shipnotify-log` shows:
   ```
   logger -p mail.info -t shipnotify "$*"
   ```
   It's tagged `mail.info`, not `local3` -- almost certainly a copy-paste leftover from some other script that
   really did send mail-related notices.
3. **REASONING**: `mail` is a completely real, standard syslog facility -- and rsyslog ships with a rule for
   it out of the box, installed by the `rsyslog` package itself and present long before `shipnotify` was ever
   written: `grep mail /etc/rsyslog.conf` shows `mail.*  -/var/log/mail.log`. This isn't a debug rule anyone
   added to hide something -- it's a completely legitimate, standard default that's simply catching messages
   that were never meant for it. `cat /var/log/mail.log` confirms shipnotify's messages have been landing
   there the whole time (and, since the default catch-all `*.*` rule doesn't exclude `mail`, in
   `/var/log/syslog` too) -- just never where the dedicated per-app rule expects them.
4. Fix the facility the app actually logs on to match the rule that was written for it:
   `sudo sed -i 's/-p mail.info/-p local3.info/' /usr/local/bin/shipnotify-log`
   No rsyslog restart or config change is needed -- the routing rule was correct all along; only the app's own
   facility tag was wrong.
5. Verify: `shipnotify-log 'confirm fix'` followed by `tail /var/log/shipnotify/shipnotify.log` now shows the
   line.

Lesson: a message doesn't have to hit a deliberately silencing rule (`/dev/null`, `& stop`) to end up
somewhere unexpected -- it can just as easily be legitimately and correctly routed by a completely ordinary,
pre-existing default rule that was never meant to interact with your app at all. When a dedicated rule for a
service looks correct but nothing's arriving, check what facility/severity the app is actually emitting on,
not just what the rule says it's listening for.
