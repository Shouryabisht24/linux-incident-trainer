## Solution

1. Confirm the actual error: nginx's own startup attempt logged `Address already in use` for
   port 8080, which means something else already holds that socket -- nginx's config is not the
   problem.
2. Find out who: `sudo ss -tlnp | grep 8080` (or `sudo lsof -i :8080`) shows a process called
   `legacy-agent` bound to the port.
3. `legacy-agent` is an old internal tool that was supposed to be decommissioned but its startup
   entry was never removed, so it still claims port 8080 on every boot, before nginx gets a
   chance to.
4. Stop it: `sudo pkill -x legacy-agent`. Confirm the port is free:
   `sudo ss -tlnp | grep 8080` now shows nothing.
5. Start the real service: `sudo service nginx start`.
6. Verify: `curl http://localhost:8080/` now returns the app's response.

Lesson: "service X won't start" and "service X is misconfigured" are not the same diagnosis --
`Address already in use` specifically means something else already owns the socket. Always check
who's actually listening (`ss -tlnp` / `lsof -i :<port>`) before touching the service's own
configuration; a perfectly healthy config can't bind to a port someone else is already sitting on.
