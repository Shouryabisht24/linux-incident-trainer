## Solution

1. `sudo systemctl status webapp` shows it `active (running)` with a healthy-looking PID, and
   `cat /etc/systemd/system/webapp.service` shows exactly what every runbook documents:
   `Environment=LISTEN_PORT=8080`. Yet `curl --connect-timeout 3 --max-time 5 http://localhost:8080/`
   times out. The unit isn't crashing and the base file isn't wrong -- so the mismatch has to be coming
   from somewhere else in systemd's configuration.
2. A plain `cat` of the `.service` file only shows the *base* unit. systemd actually loads a unit as the
   base file merged with any drop-ins under `<unitname>.service.d/*.conf`. See the real, merged
   configuration with `sudo systemctl cat webapp.service`, or check the effective runtime value directly:
   `sudo systemctl show webapp -p Environment`.
3. Both reveal a drop-in at `/etc/systemd/system/webapp.service.d/override.conf` setting
   `Environment=LISTEN_PORT=9099`. For repeatable directives like `Environment=`, a later occurrence of the
   same key overrides an earlier one -- the drop-in is loaded after the base unit, so its `9099` silently
   wins over the base unit's `8080`. Nothing about this is a systemd error: the unit loads clean, starts
   clean, and reports healthy the entire time.
4. Confirm what's actually happening: `sudo ss -tlnp | grep 9099` shows webapp's own PID bound there
   instead of on 8080. The comment left in the drop-in (`TEMP: point at the debug port ... revert after`)
   explains how it got there -- a debugging override that was never cleaned up.
5. Fix it by removing the stale override entirely (or editing it back to 8080 if you want to keep the
   drop-in mechanism in place):
   ```
   sudo rm /etc/systemd/system/webapp.service.d/override.conf
   sudo systemctl daemon-reload
   sudo systemctl restart webapp
   ```
6. `curl http://localhost:8080/` now returns `web ok`.

Lesson: a unit can be perfectly "healthy" by every signal `systemctl status` gives you and still be
configured wrong, because drop-ins under `<unit>.d/` load *after* the base unit file and silently override
matching directives -- with no warning, no error, nothing in `journalctl` to flag it. `systemctl cat` (not a
plain file `cat`) is the only way to see a unit's true, fully-merged configuration; `systemctl show -p
<Directive>` confirms the effective runtime value. Forgotten debug/temporary overrides in drop-in files are
a classic, easy-to-miss source of exactly this kind of silent drift between documentation and reality.
