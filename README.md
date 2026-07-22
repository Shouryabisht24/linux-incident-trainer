# DevOps Troubleshooting Trainer

A self-hosted, Dockerized learning tool for practicing real-world Linux/DevOps production incidents. Each challenge gives you a **live terminal into an actually-broken container** — not a quiz — with progressive hints and a full solution available as a last resort.

See `/Users/shourya/.claude/plans/logical-jumping-puddle.md` for the full implementation plan, `tasks.md` for build progress, and `decisions/` for the reasoning behind non-obvious architectural choices.

## Requirements

- Docker Desktop (or another Docker Engine) installed and running.
- Nothing else — the frontend, backend, and database all run in containers.

## Local setup

```bash
cp .env.example .env    # then edit POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
```

- Frontend: http://localhost:3000 (or http://localhost:5173 in dev, via `docker-compose.override.yml`)
- Backend health check: http://localhost:4000/health

`docker-compose.override.yml` is auto-loaded by `docker compose up` and adds bind mounts + hot reload for local development. It is not intended for production use.

## Security notes

This app mounts the host's `/var/run/docker.sock` into the backend container so it can spin up ephemeral "broken Linux system" containers per challenge session (see `decisions/0001-docker-outside-of-docker.md`). That grants the backend **root-equivalent access to the host**. This is an accepted tradeoff for a personal, local learning tool — it is **not** safe to expose as-is.

Do not:
- Expose this stack to the public internet (no router port-forwarding, no public cloud deploy with an open port) without at minimum a VPN/Tailscale layer in front.
- Proxy the raw Docker socket to the frontend/browser — only the backend process holds it.
- Bind-mount arbitrary host paths into challenge containers — see `decisions/0002-no-host-bind-mounts-in-challenge-containers.md`.

Every challenge container gets per-container resource limits (memory, CPU, PID count) and is labeled `app=devops-trainer` so orphans get cleaned up automatically if the backend restarts.

### Isolation of challenge containers

- **No network by default.** Challenge containers run with `NetworkMode: none` (loopback only) unless a challenge sets `requires_network`, in which case they join the `devops-trainer-challenges` bridge which is `internal: true` — **no outbound internet**. A user in a broken box can't call home or reach the host.
- **No host filesystem.** Fixtures are baked into each image at build time; size-bounded, mutable scenarios (disk-full) use a per-challenge `tmpfs`, never a host bind mount (`decisions/0002`, `decisions/0009`).
- **systemd challenges** run with `CapAdd: SYS_ADMIN` and a writable cgroup mount (`decisions/0005`, `decisions/0010`). This is a broader capability than the other categories; it's still confined to a resource-limited, network-isolated container, but be aware those specific challenge containers are less locked-down than the rest.

### Operational hardening (Phase 5)

- **One live session per user** and a global `MAX_CONCURRENT_SESSIONS` cap (default 3) — starting a new session tears down the user's previous one; exceeding the global cap returns HTTP 429.
- **Idle reaper** stops/removes containers idle past `IDLE_TIMEOUT_MINUTES` (default 20; shorter grace after solve), and **boot-time reconciliation** force-removes any `app=devops-trainer` container with no live DB session and marks stale sessions `error`. Together these guarantee orphaned challenge containers are self-healing across crashes and restarts.
- **Graceful shutdown**: on `SIGTERM` the production backend (node as PID 1) drains in-flight sessions — destroying their containers and closing terminal WebSockets — so a normal `docker compose down` doesn't leak containers. Note: in **dev** (`docker compose up` with the hot-reload override) the `tsx` watcher hard-kills the app on shutdown, so the drain doesn't run there; the boot-time reconciliation above cleans up on the next start. See `decisions/0011`.
- **Auth rate limiting**: `POST /api/auth/login` and `/api/auth/signup` are rate-limited in-memory (login keyed per IP+email, signup per IP; tunable via `AUTH_LOGIN_MAX`, `AUTH_SIGNUP_MAX`, `AUTH_RATE_WINDOW_MS`). This is deliberately simple/non-distributed — appropriate for a single-node personal tool.
- **Structured logging**: leveled, timestamped logs across the backend (`LOG_LEVEL=debug|info|warn|error`, default `info`).

None of this turns the app into something safe to expose publicly — the docker.sock exposure above is the dominant risk and is unchanged. The hardening is about correct, debuggable operation of a local tool, not internet-facing security.
