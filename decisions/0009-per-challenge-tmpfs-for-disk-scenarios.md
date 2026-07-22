# 0009 — Per-challenge tmpfs mounts for disk/filesystem scenarios

## Decision
Challenges may declare a `tmpfs` map in `challenge.json` (`{ "<mount path>": "<options, e.g. size=16m>" }`).
`docker.service.ts` applies it as `HostConfig.Tmpfs` when creating the session container. A new
nullable `challenges.tmpfs JSONB` column (migration `0002_challenge_tmpfs.sql`) round-trips it through the
DB, and it's added to the challenge schema. This is additive — no existing challenge or API response shape
changes.

## Why
The "disk & filesystem" category needs scenarios where a real filesystem genuinely fills up (`df` shows 100%,
`No space left on device`, inode exhaustion). We can't do that on the container's shared overlay root (its
`df` reflects the host VM's huge disk), and per `decisions/0002` we never bind-mount host paths into challenge
containers. A size-bounded `tmpfs` is the right primitive: it's a real, mountable, fillable filesystem with a
hard size (and optional `nr_inodes`) limit, isolated per container, and it evaporates on teardown.

Because a `tmpfs` is empty at container start (the mount shadows whatever the image baked at that path), the
"fill" that creates the break has to happen at **runtime**, not in `seed.sh` (which runs at build time). Those
challenges therefore do the fill in their Dockerfile `CMD` (e.g. `dd` a large file, or create files until
inodes run out) and then `exec sleep infinity`. Two gotchas found by live testing:
- A fill loop written as `while : > file; do …` **exits the shell** when the redirection fails, because `:` is
  a POSIX *special builtin* (a redirection error on a special builtin is fatal). Use `touch`/`true` instead so
  the loop ends cleanly and the container keeps running.
- `/etc/hosts`, `/etc/resolv.conf`, `/etc/hostname` are bind-mounted by Docker and are **read-only at build
  time** — you can't bake edits to them in `seed.sh`; do it in the runtime `CMD`.

## How to apply
- Disk-full: `"tmpfs": { "/var/log/app": "size=20m,mode=1777" }`, fill in CMD, check free space with `df`.
- Inode exhaustion: add `nr_inodes=N` and create tiny files until it's full; check by trying to create a file.
- Keep sizes small (tens of MB) — it's RAM-backed and counts against the container, which also has a memory limit.
