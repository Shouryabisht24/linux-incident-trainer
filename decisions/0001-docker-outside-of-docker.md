# 0001 — Docker-outside-of-Docker for challenge containers

## Decision
The backend mounts the host's `/var/run/docker.sock` and drives it via `dockerode` to build challenge images and spin up/tear down one ephemeral container per challenge session, rather than running a nested Docker daemon (Docker-in-Docker) or maintaining a reused pool of pre-started containers.

## Why
- **Vs. Docker-in-Docker (nested daemon):** DinD needs `--privileged`, which is a larger host-security exposure than a socket mount, plus a separate image cache and overlay-on-overlay storage-driver quirks — extra complexity for no benefit at this scale.
- **Vs. a reused container pool:** pooling solves a concurrency problem this tool doesn't have (single user, ~1–3 concurrent sessions) and undermines the "guaranteed fresh broken state" property every challenge attempt needs. It would also require reliable state reset between reuses across ~50 different challenge types.
- **Vs. microVM/gVisor isolation:** overkill for a personal local tool. Revisit only if this ever becomes a public multi-tenant service.

## Tradeoff accepted
Mounting the docker socket into the backend container is root-equivalent access to the host. This is acceptable for a personal/local learning tool but is NOT safe to expose publicly. See [[0002-no-host-bind-mounts-in-challenge-containers]] for the mitigations layered on top of this.

## How to apply
Any change to how challenge containers are created/destroyed should go through `backend/src/services/docker.service.ts`. Don't reach for DinD or a container pool without revisiting this decision first.
