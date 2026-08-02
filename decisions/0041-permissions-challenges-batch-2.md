# 0041 — Permissions & Ownership batch 2: 5 more challenges (capabilities, ACLs, sockets, umask, noexec+service)

## Decision

Added 5 new challenges to close out the "Permissions & Ownership" category (6 already existed:
`perm-config-blocks-service`, `perm-config-unreadable-by-app`, `perm-executable-bit-missing`,
`perm-service-logdir-unwritable`, `perm-setuid-helper-bit-stripped`,
`perm-sticky-bit-missing-shared-dir`):

1. **`perm-capability-lost-on-redeploy`** (intermediate) — a monitoring helper that needs
   `CAP_NET_RAW` to build a raw ICMP socket loses that Linux file capability the moment its binary
   is redeployed/overwritten, even though ownership and mode look byte-identical to before.
2. **`perm-acl-deny-blocks-user`** (intermediate) — a POSIX ACL named-user deny entry, added to
   lock out a departed contractor, blocks the legitimate `etl` service account instead, despite the
   file's normal owner/group/other bits being fully permissive (`0644`).
3. **`perm-socket-group-blocks-client`** (intermediate) — a healthy stats daemon's Unix domain
   socket is created under a plain (non-setgid) run directory, so it always inherits the daemon's
   own private group instead of the shared client group, blocking an already-correctly-provisioned
   client account.
4. **`perm-umask-hides-files-from-consumer`** (beginner) — a cron job's report-generation script
   sets `umask 077`, so files it writes are unreadable by a separate, correctly-group-provisioned
   dashboard consumer, even though the containing directory's own setgid/group setup is fine.
5. **`perm-noexec-mount-blocks-service-helper`** (hard) — a SysV-style service (`renderd`, driven
   via `service renderd start/stop/status`) runs a startup self-test against an internal helper
   staged on a noexec-mounted directory; the service refuses to start, discovered through the
   service's own start/status/log output, not by directly invoking the helper.

## Seed idea swapped: `chattr +i` (immutable attribute) → file capability loss

Per the task brief's explicit instruction to test `chattr`/ACL feasibility empirically before
committing to a build, both were tested in a throwaway container before any challenge files were
written:

- **ACLs work correctly** on this container's filesystem (overlayfs, confirmed via
  `docker info --format '{{.Driver}}'`) — `setfacl`/`getfacl` (from the `acl` package) behave
  exactly as documented, including named-user entries overriding group/other bits. (See the
  separate "ACL persistence" finding below for a real gotcha that *was* found with ACLs, just not
  a feasibility blocker.)
- **`chattr +i` does not work** in this environment without an explicit `--cap-add
  LINUX_IMMUTABLE`, which is not part of Docker's default capability set and — critically — is not
  something `challenge.json`'s schema or `docker.service.ts`'s `createSessionContainer` exposes a
  way to request (only `requires_systemd` grants an extra capability, `SYS_ADMIN`, which was also
  empirically confirmed *not* to be sufficient on its own: `chattr +i` still fails with `Operation
  not permitted` under `--cap-add SYS_ADMIN` alone). Since neither the schema nor
  `docker.service.ts` may be touched by a challenge-authoring batch, `chattr` is not a workable
  mechanism on this platform as currently built, and idea 1 was swapped for
  `perm-capability-lost-on-redeploy` (Linux file capabilities via `setcap`/`getcap`, gated by the
  `SETFCAP` capability, which *is* in Docker's default set — confirmed working with zero extra
  container flags).

The capability chosen for the replacement, `CAP_NET_RAW`, was itself picked after ruling out
`CAP_NET_BIND_SERVICE` (the more obvious "why capabilities exist" demo, binding a port <1024 as a
non-root user): this environment's containers have `net.ipv4.ip_unprivileged_port_start = 0`, so
*every* user can already bind any port with no capability at all, which would have made that
version of the challenge unbreakable regardless of capability state. `CAP_NET_RAW` (raw ICMP socket
creation) was confirmed to behave correctly instead — genuinely `EPERM` for an unprivileged user
without it, genuinely succeeds once `setcap cap_net_raw=+ep` is applied — and works identically
under `--network none`, since it's gated purely by the capability check in `socket()`, not by
actual network reachability.

## Notable authoring finding: POSIX ACLs do not survive a Docker image build

Not a feasibility blocker for ACLs generally (see above), but a real, empirically-confirmed gotcha
that shapes how `perm-acl-deny-blocks-user` had to be built: a `setfacl` call executed in `seed.sh`
(i.e., during a Dockerfile `RUN` step at build time) is visible via `getfacl` in later build steps
of the *same build*, but does **not** survive into a fresh container started from the finished,
exported image — `getfacl` on that file in a new container shows no ACL at all. Verified directly
with a minimal isolated Dockerfile (`RUN setfacl ...` followed by `RUN getfacl ...` showed the
entry; a container run from the finished image afterward showed none). This is the same class of
gotcha AUTHORING.md already documents for tmpfs ("tmpfs mounts are empty at container start — fill
them in `CMD`, not `seed.sh`"), and the fix is the same shape: `perm-acl-deny-blocks-user`'s
`setfacl` call moved out of `seed.sh` entirely and into the Dockerfile's `CMD`, applied fresh every
time a container starts. `seed.sh` still creates the file/user/directory at build time (regular
file content and ownership do survive the build fine — it's specifically the ACL xattr that
doesn't survive image layer export/import in this environment). This is worth flagging for any
future challenge author reaching for `setfacl`/ACLs.

## Notable authoring finding: a per-connection-recreated Unix socket doesn't hold a live fix

`perm-socket-group-blocks-client`'s first draft applied `chgrp` directly to the currently-running
socket file as the intended fix and nothing else. Live verification caught that this doesn't
actually get exercised by repeated `check.sh` runs: the minimal `nc -lU`-based stand-in daemon only
rebinds a fresh socket file once the *previous* client connection completes and that `nc` process
exits — but an unprivileged client whose `connect()` is rejected for a permission reason never
completes a connection at all, so the daemon's original (broken) socket instance just sits there
indefinitely, immune to a chgrp applied only to itself, since the kernel already committed to that
specific instance's ownership at bind() time. The design was corrected to also require a durable,
directory-level fix (setgid + correct group on `/run/metricsd`, confirmed empirically to force
*every* subsequently-created file/socket inside it to inherit the directory's group regardless of
the creating process's own primary group) — `check.sh`, hints, and `solution.md` all now walk
through fixing the live socket immediately *and* the directory for durability, and the loop was
re-verified end-to-end afterward, including confirming the fix survives an actual socket
recreation (killing the `nc` process and letting the daemon loop rebind).

## Verification results

All 5 went through the full loop (`docker build` → run with real flags, including the noexec
`tmpfs` mount for challenge 5 — `--tmpfs /opt/render-assets:size=20m,mode=755,noexec` — matching
`docker.service.ts`'s `createSessionContainer` → `check.sh` fails before any fix → the break
independently confirmed as real for the actual unprivileged actor (and, for challenge 5, confirmed
to fail even for *root*, since `noexec` is a mount-level restriction like the execute-bit exception
in decision 0007, not a DAC check) → fix applied as `trainee` via `docker exec -u trainee` →
`check.sh` passes after, re-run to confirm repeatability where relevant (challenges 3 and 4) →
clean PASS on all 5, worked sequentially rather than in parallel to avoid the Docker resource
contention that stalled an earlier large batch. All `verify/perm-*` containers and images created
during this batch were removed afterward; three unrelated leftover `verify/*` images belonging to
a concurrent batch (users/sudo, decision 0042) were left untouched.

Two of the five additionally went through the real stack, per the task brief:
`perm-socket-group-blocks-client` and `perm-noexec-mount-blocks-service-helper` (the two judged
trickiest to get right end-to-end). The backend was restarted (`docker compose restart backend`)
to pick up all 5 new `challenge.json`s via `syncChallengesFromDisk` on boot — confirmed in backend
logs, all 5 new slugs synced cleanly alongside the pre-existing catalog. A throwaway account was
signed up via `POST /api/auth/signup`, a real session started for each of the two challenges via
`POST /api/challenges/<slug>/sessions`, `POST /api/sessions/:id/check` confirmed `passed: false`
before the fix for both, the same fixes from each `solution.md` applied as `trainee` via
`docker exec -u trainee` into the real session container (found via
`docker ps --filter label=sessionId=...`), `POST /api/sessions/:id/check` confirmed `passed: true`
after for both, each session stopped via `POST /api/sessions/:id/stop` (containers torn down,
confirmed via `docker ps --filter label=app=devops-trainer` showing nothing), and the throwaway
account deleted via `DELETE /api/auth/me`.

The dev-override `docker compose` stack (postgres + backend + frontend) was left running as the
steady state throughout and afterward.
