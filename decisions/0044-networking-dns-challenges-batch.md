# 0044 — Networking & DNS challenges batch (5 new, bringing the category to 10)

## Decision

Added 5 new challenges to `networking-dns`, distinct from the 5 that already existed
(`dns-hosts-entry-wrong`, `net-nginx-502-upstream`, `net-port-conflict-stale-process`,
`net-service-wrong-port`, `net-tls-cert-expired-nginx`):

1. **`net-bind-wrong-interface`** (beginner) — nginx is healthy and holding port 8080 open, but bound
   to `127.0.0.2` (a valid loopback alias) instead of `127.0.0.1`/`0.0.0.0`, so `curl localhost:8080`
   gets connection refused even though `ss -tlnp` proves the process is up. Distinct from
   `net-service-wrong-port` (wrong port number, same address) — this is wrong *address*, same port.
2. **`net-unix-socket-path-mismatch`** (intermediate) — nginx reverse-proxies to a backend over a unix
   domain socket; the backend's real socket moved to `app-v2.sock` during a rollout but the proxy's
   `proxy_pass` still points at the old `app.sock`, producing a 502. Distinct from
   `net-nginx-502-upstream` (that one is a TCP host:port mismatch, diagnosable via `ss -tlnp`; this one
   has no TCP listener to find at all — the fix path is `ls` the socket directory and read nginx's error
   log for the exact unix path it tried).
3. **`dns-resolv-search-domain-wrong`** (intermediate) — a stale `search` domain in `/etc/resolv.conf`
   (left over from a zone rename) means the bare hostname `db` expands to the wrong FQDN and never
   resolves, even though the real record (`db.internal.example`, served by a local dnsmasq acting as
   the internal resolver) is completely correct. Distinct from `dns-hosts-entry-wrong` (a bad static
   `/etc/hosts` line) — this is client-side search-suffix config, and `/etc/hosts` is untouched/correct
   throughout. Per AUTHORING.md, the resolv.conf edit is baked into the Dockerfile `CMD` (full overwrite
   via `>`, not `sed -i`, since it's a bind-mounted file at runtime) rather than `seed.sh`.
4. **`net-services-port-lookup-stale`** (intermediate) — a small app resolves its own listen port at
   startup via `socket.getservbyname("myapp", "tcp")` against `/etc/services`, rather than hardcoding a
   port number; the `/etc/services` entry is stale from before a port reassignment, so the (perfectly
   healthy) app keeps binding to the old port. This is the replacement for the originally-seeded idea
   #4 below.
5. **`systemd-active-not-holding-port`** (hard, `requires_systemd: true`) — two units both target port
   8080: `webapp.service` (real app) and `webapp-canary.service` (a canary-rollout agent that should
   have been decommissioned after cutover but is still enabled and starts first, winning the race every
   boot). `webapp.service`'s binary doesn't crash on `bind()` failure — it logs and idles forever — so
   `systemctl is-active webapp` genuinely reports `active` while the real app never serves anything.
   Distinct from `net-port-conflict-stale-process` (a bare background process losing a port race,
   diagnosed with `pkill -x`) — this frames the same underlying "who really holds the port" lesson
   through two systemd units, where the twist is that `systemctl status` on the *intended* unit looks
   healthy and the fix requires stopping+disabling a completely different, also-"active" unit.

## Seed swapped

Original seed idea #4 was "a local firewall rule blocks a service's own port even on loopback"
(iptables/nftables). Tested first, per the task brief's explicit instruction to verify capability
availability before building around it:

```
docker run --rm debian:12-slim bash -lc 'apt-get install -y iptables; iptables -A INPUT -p tcp --dport 8080 -j DROP'
# iptables v1.8.9 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)
# nftables: Operation not permitted (you must be root) / cache initialization failed
```

Confirmed against `backend/src/services/docker.service.ts::createSessionContainer`: `HostConfig.CapAdd`
is only ever set to `["SYS_ADMIN"]`, and only when `requires_systemd` is true — there is no `NET_ADMIN`
grant under any `challenge.json` combination, including `requires_network: true` (which only changes
`NetworkMode` between `"none"` and the internal bridge; it adds no capabilities). Default Docker caps
drop `NET_ADMIN`, so no iptables/nftables rule can ever be installed inside a session container as it
exists today — building a challenge around it would silently no-op or error out for every trainee, not
just fail as intended. Swapped for the `/etc/services`/`getservbyname()` idea (#4 above), which is a
genuine, distinct Linux networking-name-resolution mechanism, needs no elevated capabilities, and was
prototyped and verified end-to-end before being written up as a full challenge.

All other 4 seed ideas were built close to their original framing; none needed a swap.

## Verification results

All 5 went through the full loop from `AUTHORING.md` sequentially (build clean → run with production
flags → `check.sh` non-zero before fix → fix `docker exec -u trainee` → `check.sh` zero after fix), plus
an initial prototype-in-isolation pass for each novel mechanism (loopback alias bind, nginx-to-UDS
reverse proxy, dnsmasq + resolv.conf search domain, Python `getservbyname`, two-unit systemd port race)
before writing the final challenge files, to avoid discovering a fundamental infeasibility only after
full authoring (as happened with the iptables idea). All 5 passed on the first attempt after prototyping.

Two were additionally verified through the real stack: signed up a throwaway account
(`netdns-verify-batch@example.com`), `docker compose restart backend` to pick up the new
`challenges/*` directories (`syncChallengesFromDisk` only runs at boot), confirmed both showed up via
`GET /api/challenges`, then for `dns-resolv-search-domain-wrong` and `systemd-active-not-holding-port`:
`POST /api/challenges/<slug>/sessions` → real container came up with the expected image tag → `POST
/sessions/:id/check` returned `passed:false` with the expected message → fixed as `trainee` via `docker
exec -u trainee` into the real session container → `POST /sessions/:id/check` returned `passed:true` →
`POST /sessions/:id/stop` tore the container down (confirmed via `docker ps --filter
label=app=devops-trainer`, empty afterward). Also incidentally confirmed decision 0003 (one live session
per user): starting the second real session automatically removed the first session's container.

Cleanup: the throwaway account was deleted via `DELETE /api/auth/me`, all `verify/*` scratch images and
probe Dockerfiles/containers were removed, no orphan `app=devops-trainer` containers remain, and the dev
override stack (postgres/backend/frontend) was left running per the task's steady-state requirement.
