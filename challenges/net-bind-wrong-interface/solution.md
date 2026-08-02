## Solution

1. `curl http://127.0.0.1:8080/` -> connection refused. But `pgrep nginx` (or `sudo systemctl status`
   equivalent check) shows nginx is running -- this isn't a crashed service, so the question is *where*
   it's actually listening, not *whether* it's up.
2. `sudo ss -tlnp` shows:
   ```
   LISTEN  0  511  127.0.0.2:8080  0.0.0.0:*  users:(("nginx",...))
   ```
   nginx is bound to `127.0.0.2:8080`, not `127.0.0.1:8080`. `127.0.0.2` is a perfectly legal address --
   the entire `127.0.0.0/8` block is loopback, not just `.1` -- but nothing resolves `localhost` or a bare
   client connection to it by default, so every real client, health check, and monitoring probe hits
   `127.0.0.1` and gets refused.
3. Find the config: `grep -rn listen /etc/nginx/` points at `/etc/nginx/conf.d/app.conf`:
   `listen 127.0.0.2:8080;`.
4. Fix the bind address: change it to `listen 127.0.0.1:8080;` (or `0.0.0.0:8080` to accept on every local
   interface, which is the more common intent for a service like this).
5. Validate and reload without dropping connections: `sudo nginx -t && sudo nginx -s reload`.
6. `curl http://127.0.0.1:8080/` now returns `web ok`. `sudo ss -tlnp` confirms nginx is now on
   `127.0.0.1:8080`.

Lesson: "connection refused" plus "the process is definitely running" means the mismatch is in *what
address* it's bound to, not whether it's alive -- a distinct failure mode from a wrong *port* (same address,
different number) or a dead process. `127.0.0.0/8` is entirely loopback, so a service can be "up," "on
localhost" in the loosest sense, and still unreachable by the specific loopback address (`127.0.0.1`) that
`localhost` and default client behavior actually use. Always read the *address* half of `ss -tlnp`'s output,
not just the port.
