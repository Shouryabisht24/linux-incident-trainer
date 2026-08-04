## Solution

1. `sudo systemctl status notify-relay.socket` shows `active (listening)`, and
   `sudo systemctl status notify-relay.service` shows `inactive (dead)`, waiting to be triggered. That's
   exactly the expected, healthy state for a socket-activated service under `Accept=no` (the default) before
   its first connection arrives -- neither unit reports anything wrong.
2. The actual symptom only shows up when something tries to use the service the way every client and
   healthcheck on the box does: `curl --unix-socket /run/notify-relay.sock --connect-timeout 3 --max-time 5
   http://localhost/` fails to connect at all, even though the socket unit insists it's listening.
3. Find out what path it's really bound to: `sudo systemctl show notify-relay.socket -p Listen` (or
   `sudo systemctl cat notify-relay.socket`) shows `ListenStream=/tmp/notify-relay.sock` -- not
   `/run/notify-relay.sock`. Confirm the service itself is genuinely fine, just reachable at the wrong
   address: `curl --unix-socket /tmp/notify-relay.sock http://localhost/` answers normally.
4. This is the entire bug: at some point the socket unit's listening path was changed to `/tmp` (a
   migration, most likely), but nothing downstream -- clients, healthchecks, documentation -- was ever
   updated to match. Both units are individually correct and healthy; the mismatch is purely between what
   the socket unit binds and what everything else expects.
5. Fix the `.socket` unit's `ListenStream=` back to the documented path. A socket's actual bound address is
   established when the unit starts, so a `daemon-reload` alone doesn't move it -- the old listening socket
   has to be torn down first:
   ```
   sudo systemctl stop notify-relay.socket
   sudo sed -i 's#/tmp/notify-relay.sock#/run/notify-relay.sock#' /etc/systemd/system/notify-relay.socket
   sudo systemctl daemon-reload
   sudo systemctl start notify-relay.socket
   ```
6. `curl --unix-socket /run/notify-relay.sock http://localhost/` now returns `ok`.

Lesson: socket activation splits a service's identity across two units, and systemd is happy to report both
as individually fine even when the pairing between "where the socket actually listens" and "where the rest
of the world expects it to be" has drifted apart. `systemctl status`/`is-active` on either unit alone won't
catch this -- you have to actually try the operation from the documented address, then trace the real
listening path with `systemctl show <unit>.socket -p Listen` (or `systemctl cat`) rather than trusting that
"active (listening)" means "listening where you think."
