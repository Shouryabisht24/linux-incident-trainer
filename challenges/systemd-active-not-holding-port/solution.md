## Solution

1. `systemctl is-active webapp` reports `active`, and `systemctl status webapp` shows a real PID that's
   actually running -- systemd is telling the truth about the *unit*. But `curl --connect-timeout 3
   --max-time 5 http://localhost:8080/` still times out. "Active" is not the same claim as "successfully
   doing its job" -- a unit can have a live, non-crashing process that still isn't serving anything.
2. Find out who really holds the port: `sudo ss -tlnp | grep 8080` shows a PID. Trace that PID back to its
   unit: `ps -p <pid> -o unit=` (or `systemctl status <pid>`) shows it belongs to
   `webapp-canary.service`, not `webapp.service`.
3. `webapp-canary.service` is a leftover agent from an earlier canary/blue-green rollout. It was supposed
   to be stopped and disabled after cutover to the real `webapp.service`, but the unit was never removed --
   it's still enabled, starts on every boot (ordered to start before `webapp.service` via the unit's
   `After=`), and wins the race for port 8080 every single time.
4. So why does `webapp.service` itself show "active" if it can't bind the port? Check its own logs:
   `sudo journalctl -u webapp -e` (run `sudo journalctl --flush` first if the journal looks empty --
   persistence needs an explicit flush) shows `webapp: bind() failed, port already in use -- idling`. The
   real app's binary doesn't crash on a bind failure -- it logs the problem and idles forever. Type=simple
   only cares whether the main process is still alive, not whether it actually accomplished anything, so
   the unit stays "active (running)" indefinitely while doing nothing.
5. Fix it properly -- stopping the canary alone isn't durable, since it would just win the race again on
   the next restart:
   ```
   sudo systemctl stop webapp-canary
   sudo systemctl disable webapp-canary
   sudo systemctl restart webapp
   ```
6. `curl http://localhost:8080/` now returns `web ok`. `sudo ss -tlnp` confirms the PID on 8080 now
   belongs to `webapp.service`.

Lesson: `systemctl is-active`/`status` reports on the *process*, not on whether it accomplished its actual
purpose -- a unit whose `ExecStart` swallows its own failure (catches an error and idles rather than
exiting) will show "active" forever without ever doing its job. When a health check disagrees with
`systemctl status`, don't trust either one in isolation: check who *actually* holds the resource in
question (`ss -tlnp`, then trace the PID back to its real unit) before assuming the unit reporting "active"
is the one you think it is. Leftover units from rollouts (canary/blue-green agents, old cutover scripts)
that never got disabled are a classic source of exactly this kind of silent port-stealing.
