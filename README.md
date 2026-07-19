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
