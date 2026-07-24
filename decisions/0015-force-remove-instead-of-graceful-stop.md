# 0015 — Force-remove challenge containers instead of a graceful stop first

## Decision
`destroyContainer()` in `docker.service.ts` now calls only `container.remove({ force: true })`. It no longer calls `container.stop({ t: 5 })` first.

## Why
Session stop was taking 3-5 seconds end-to-end (measured: 5.114s before this change) when it should be near-instant — noticeable and confusing on a UI whose "Stop Session" button implies an immediate action.

`container.stop({ t: 5 })` sends SIGTERM and waits up to `t` seconds for the process to exit on its own before sending SIGKILL. Challenge containers run as PID 1 directly — `sleep infinity` for most challenges, `/sbin/init` for systemd-in-Docker ones (`decisions/0005`) — and neither installs a SIGTERM handler. On Linux, a process running as PID 1 gets special signal-disposition semantics: for a signal with no explicitly installed handler, the kernel does *not* apply the normal default disposition (e.g. terminate) the way it would for any other process — it's simply ignored. So `stop()` was reliably burning its entire timeout waiting for a SIGTERM that was never going to do anything, before falling back to SIGKILL anyway. This is a well-documented Docker gotcha, not specific to this codebase.

These are disposable, single-use training containers: nothing meaningful is ever written that needs a graceful flush at teardown (no persisted state outside the container, no bind mounts per `decisions/0002`), and the container is thrown away either way. `container.remove({ force: true })` already SIGKILLs a still-running container as part of removing it, per Docker's own API semantics — so the separate graceful-stop step bought nothing here except the 5-second wait.

## Verified
Measured directly against the real stack (`docker compose up --build -d`, `time curl .../api/sessions/:id/stop`):
- Before (`stop({t:5})` + `remove({force:true})`): **5.114s**
- After (`remove({force:true})` alone): **0.067s** for a `sleep infinity`-style challenge (`perm-config-blocks-service`), **0.082s** for a real systemd-in-Docker challenge (`systemd-masked-service`, confirmed PID 1 is `systemd` via `docker exec <id> ps -p1`)

`docker ps -a --filter label=app=devops-trainer` was empty (no orphan/zombie) after each stop in both cases — force-remove alone tears down a systemd container just as cleanly as a `sleep infinity` one; systemd's PID 1 doesn't need different handling here.

## How to apply
If a future challenge type or teardown path ever needs to run cleanup logic *inside* the container before it's destroyed (e.g. flushing something to a location outside the container, which would be unusual given `decisions/0002`'s no-bind-mounts rule), that cleanup must happen via an explicit `exec` before calling `destroyContainer()` — not by reintroducing a graceful `stop()`, which reintroduces the multi-second SIGTERM-timeout cost for no benefit on PID-1-as-`sleep`/`init` containers.
