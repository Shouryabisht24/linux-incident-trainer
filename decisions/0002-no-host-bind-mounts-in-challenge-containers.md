# 0002 — No host bind-mounts in challenge containers

## Decision
Challenge containers never use host bind-mounts. All fixture/break data is baked into the challenge image via `Dockerfile COPY`. Scenarios needing a size-constrained filesystem (e.g. disk-full simulations) use `tmpfs` mounts (`HostConfig.Tmpfs`) instead of host paths.

## Why
Two independent reasons:
1. **It wouldn't work anyway.** `dockerode`'s `createContainer` talks to the real Docker daemon, which on this machine runs inside Docker Desktop's own Linux VM. A path like `/app/challenges/foo/data` inside the *backend* container is meaningless to that daemon — there's no shared filesystem to bind-mount from.
2. **It would be a security hole if it did work.** Given [[0001-docker-outside-of-docker]] already grants the backend root-equivalent host access via the docker socket, letting challenge containers bind-mount arbitrary host paths would let a "broken container" a user is actively poking at potentially escape-write to the real host filesystem.

## How to apply
Every `challenges/<slug>/Dockerfile` must `COPY` in whatever `seed.sh`/`check.sh`/fixtures it needs at build time. If a challenge needs a mutable, size-bounded filesystem area, use `Tmpfs` in the container's `HostConfig`, not a bind mount.
