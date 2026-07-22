# Authoring challenges

A challenge is a directory under `challenges/<slug>/` with six files. This guide is written from actually
authoring ~26 of them; the hard-won lessons are in **Pitfalls** — read that section, it's the point.

## Anatomy

```
challenges/<slug>/
  challenge.json   # metadata (validated against _schema/challenge.schema.json)
  Dockerfile       # builds the broken box; debian:12-slim base + trainee user
  seed.sh          # runs AT BUILD TIME as root — bakes the break into the image
  check.sh         # runs as root inside the container — exit 0 = solved
  hints.json       # ordered, progressive hints (array of {order_index, text})
  solution.md      # full walkthrough, revealed as a last resort
```

**Only `Dockerfile`, `seed.sh`, `check.sh` are sent to the Docker build** (see
`docker.service.ts` build `src`). `challenge.json`, `hints.json`, `solution.md` are **never** copied into the
image — otherwise a trainee could `cat` the answer from their own terminal. Corollary: **there is no way to
`COPY` an extra fixture file.** Generate every fixture inline in `seed.sh` (it runs as root at build time) or,
for things that only exist at runtime, in the Dockerfile `CMD`.

## The container contract

- Base: `debian:12-slim`. A user `trainee` with **passwordless sudo** exists; the interactive shell runs as
  `trainee` (unprivileged). `check.sh` runs as **root**.
- Default `CMD` is `sleep infinity`. The backend execs a login shell for the terminal and runs `check.sh` on
  "Check my fix".
- Networking: `NetworkMode: none` (loopback only) unless `challenge.json` sets `"requires_network": true`
  (then an internal bridge, still **no internet**). Design single-container scenarios around `localhost`.
- Resource limits come from `challenge.json` `resource_limits` (defaults 256MB / 0.5 vCPU / 100 pids). For
  "process & performance", tight limits are part of the premise — e.g. 0.5 vCPU so one busy loop starves the box.
- `tmpfs` and `requires_systemd` unlock disk-full and systemd scenarios — see `decisions/0009` and `0010`.

## The non-negotiable rule (decision 0007)

**Break something an *unprivileged* process actually enforces, and verify it by running the real fix path.**
Root ignores file read/write DAC permissions, so `chmod 000` on a root-read config blocks nothing. The first
challenge ever shipped had exactly this bug. So:
- Permission/ownership breaks must bite a process running as a non-root user (a service's worker, a service
  account, the `trainee`). Prove it: `sudo -u <thatuser> <the thing>` must fail before the fix.
- Make `check.sh` verify the outcome **as the real actor** (`sudo -u www-data test -r …`, `curl` the service,
  `su - <svc> -c …`), not just "does root see the file". Root will lie to you.
- Exceptions worth knowing: the **execute** bit is *not* bypassed by root (`execve` needs an `x` bit even for
  root), and StrictModes/`AllowUsers`/etc. in sshd are enforced by sshd regardless of who you are — those make
  good, honest challenges too.

## Verify before you ship (every single one)

A challenge that hasn't been through this loop does not ship:
1. `docker build -t verify/<slug> challenges/<slug>` — it builds.
2. Run it the way the platform will (network mode; `--cap-add SYS_ADMIN --tmpfs /run --tmpfs /run/lock -v /sys/fs/cgroup:/sys/fs/cgroup:rw` if `requires_systemd`; `--tmpfs <path>:<opts>` for each `tmpfs`).
3. `docker exec <c> /usr/local/bin/check.sh` **before any fix → must be non-zero.**
4. Apply the intended fix **as `trainee`** (`docker exec -u trainee <c> bash -lc '<fix>'`) — proving a real
   trainee can actually fix it at their privilege level.
5. `check.sh` again → **must be 0.**

There's a ready-made harness for exactly this in the repo's scratchpad history (`verify.sh <dir> "<fix>"`):
build, run with the right flags, check-before, fix-as-trainee, check-after, report PASS/FAIL. Reuse or
re-create it — do not eyeball a Dockerfile and call it done.

## Pitfalls (all found by actually running challenges)

- **`/etc/hosts`, `/etc/resolv.conf`, `/etc/hostname` are read-only during `docker build`** and bind-mounted at
  runtime. Bake edits to them in the Dockerfile `CMD`, not `seed.sh`. And `sed -i` on them fails at runtime
  ("Device or resource busy" — it can't do its rename trick); guide trainees to an in-place editor (`nano`) or
  a `grep >tmp && cp tmp /etc/hosts` rewrite, and install an editor.
- **tmpfs mounts are empty at container start** — fill them in `CMD`, not `seed.sh`.
- **A fill loop `while : > f; do …`** exits the shell (`:` is a special builtin; redirection failure is fatal).
  Use `touch`/`true`.
- **Backgrounded daemons die when the exec shell exits** (SIGHUP). If a challenge's control script starts a
  daemon, `setsid … </dev/null &>/dev/null &` it, and don't `exec` away the daemon's recognizable argv if your
  `check.sh` finds it with `pgrep -f`.
- **`systemctl enable` doesn't work at build time** (no bus) — create the `*.target.wants/` symlink by hand.
- **`journalctl` persistence** needs `/var/log/journal` to exist *and* a `journalctl --flush` to materialize the
  first file — account for that in `check.sh`/hints.
- **Package state**: corrupt it by editing `/var/lib/dpkg/status` or `/etc/alternatives/*` directly, never via
  `apt` commands in the build (a failed download would break `docker build`).
- **`check.sh` must be fast and side-effect-light** — it runs on every "Check". Add `--connect-timeout` to any
  `curl`, clean up probe files, and don't wait on time-based mechanisms (cron): assert the *precondition* that
  makes the job run (daemon up, script executable, `run-parts --test` lists it) or run the job yourself.

## challenge.json quick reference

```jsonc
{
  "slug": "must-equal-dir-name",           // ^[a-z0-9-]+$
  "title": "Symptom-first, what the trainee sees",
  "category": "one of the 10 fixed slugs", // see challenge.service.ts FIXED_CATEGORIES
  "difficulty": "beginner|intermediate|hard",
  "description_md": "Scenario + how they'll know they're done. No spoilers.",
  "requires_network": false,               // true => internal bridge, still no internet
  "requires_systemd": false,               // true => /sbin/init + SYS_ADMIN + cgroup
  "resource_limits": { "memoryMb": 128, "cpus": 0.5, "pidsLimit": 50 },
  "tmpfs": { "/var/log/app": "size=20m,mode=1777" }, // optional, for disk scenarios
  "time_limit_minutes": 10,
  "content_version": 1                     // bump to force an image rebuild after edits
}
```

Bump `content_version` whenever you change the Dockerfile/seed/check so the lazy image cache rebuilds.
