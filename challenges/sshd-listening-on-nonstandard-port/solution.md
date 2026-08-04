## Solution

**Reasoning first.** A connection *refused/timed out* on port 22 (as opposed to a login prompt that then
rejects a password or key) means nothing is even accepting TCP on that port -- this is before authentication,
before the SSH protocol banner, before anything sshd-config-about-users would matter. That narrows it
immediately to "what is sshd bound to" rather than any access-control directive.

1. Confirm nothing's listening on 22 but sshd is running: `sudo ss -tlnp | grep sshd` shows it bound to a
   different port entirely (in this box, `2249`).
2. Ask sshd directly what it believes its port to be: `sudo sshd -T | grep -i '^port'` confirms `port 2249`.
3. Find the source: `sudo grep -rin '^port' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/` points to
   `/etc/ssh/sshd_config.d/port.conf`, left by a hardening pass that moved sshd off the default port and never
   updated the deploy pipeline (which can't be changed today).
4. sshd accepts multiple `Port` directives and will listen on all of them, so the least disruptive fix is
   additive rather than reverting the hardening change: add `Port 22` (in `port.conf` or a new drop-in).
5. Validate and reload so sshd re-binds: `sudo sshd -t && sudo service ssh reload`.
6. `ssh -p 22 -i ~/deploy_key deploy@localhost` now succeeds; the box is still also reachable on 2249 if
   anything else came to depend on that.

Lesson: unlike most sshd directives, `Port` changes require sshd to actually re-bind a socket -- a plain
config edit does nothing until reloaded (`SIGHUP` causes OpenSSH's sshd to re-exec itself, which does pick up
new `Port` lines, unlike some daemons where only a full restart opens new listeners). Also worth knowing:
`Port` is one of the few directives where *multiple* declarations are cumulative, not last-one-wins -- you
can restore compatibility without undoing the change that caused the incident.
