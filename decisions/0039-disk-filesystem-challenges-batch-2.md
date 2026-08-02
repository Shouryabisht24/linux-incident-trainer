# 0039: Disk & Filesystem challenges, batch 2 (4 new, reaching 11 total)

## Context

The Disk & Filesystem category was expanding from 7 shipped scenarios plus one earlier addition
(`disk-core-dumps-fill-tmpfs`) toward a target of 11. This batch adds the remaining 4, following the seed ideas in
the assignment brief, authored and verified one at a time (not in parallel) per the note that a prior large batch
hit stalls likely from Docker resource contention.

Existing scenarios not duplicated: `disk-full-apt-cache-buildup`, `disk-full-var-log`, `disk-inode-exhaustion`,
`disk-space-held-by-deleted-fd`, `fs-broken-release-symlink`, `fs-noexec-mount-blocks-script`,
`disk-core-dumps-fill-tmpfs`.

## Final 4 slugs

1. **`fs-circular-symlink-blocks-startup`** (beginner) -- `/etc/webapp/conf.active` is a self-referential symlink
   (`ln -sfn conf.active conf.active`, from a broken deploy script), so `webappctl start` fails immediately with
   `ELOOP` ("Too many levels of symbolic links") when it tries to read the config through it. Distinct from
   `fs-broken-release-symlink` (a *dangling* symlink, `ENOENT`) by being a genuine symlink *loop*, a different
   kernel-level error with a different diagnostic path (`readlink`/`namei -l` rather than "does the target
   exist"). No tmpfs needed -- a plain root-owned `/etc` config the unprivileged `trainee` can read but not write,
   so repointing the link requires `sudo`.

2. **`disk-stale-lock-file-fills-tmpfs`** (intermediate) -- `eventqueue`'s `brokerctl start` preallocates a
   fixed-size WAL reservation file up front and treats *its mere presence combined with low free space* as
   evidence another instance owns it. An earlier instance lost power mid-run and left a stale, oversized (20MB,
   simulating an old/larger WAL segment size) reservation behind on the 24MB tmpfs at `/var/lib/eventqueue`;
   nothing is actually running, so the "safety" check is a false positive. Fix: confirm via `pgrep` that nothing
   holds it, remove the stale file, restart (which claims its own correctly-sized 13MB reservation, leaving 11MB
   free -- above `check.sh`'s 8MB health threshold). Deliberately distinct from `proc-stale-pidfile`: this is
   about a real, size-bounded quota of *consumed disk space* being falsely attributed to a live process, not a PID
   liveness check.

   **Sizing note (found during verification):** the first draft used `size=16m` with a stale/fresh reservation
   both at 13MB, which meant even a fully correct fix could never clear the 6MB free-space health threshold
   (16 - 13 = 3MB, permanently). Fixed by bumping the tmpfs to 24MB and making the stale leftover deliberately
   larger (20MB) than what a fresh instance actually needs (13MB), so a correct fix produces real, verifiable
   headroom (11MB) afterward. Caught only by running the full check-before/fix/check-after loop, not by
   eyeballing the Dockerfile -- exactly what `AUTHORING.md`'s verification loop is for.

3. **`disk-thumbnail-cache-never-pruned`** (beginner) -- `photoapp`'s thumbnail cache at
   `/var/cache/photoapp/thumbnails` (24MB tmpfs) accumulates a thumbnail per photo forever and never prunes one
   when its source photo is deleted; thousands of small `thumb-orphan-*.jpg` leftovers (each real content, not
   empty files, so this is a bytes problem, not an inodes one) fill the mount, and `photoapp-thumbnailer` can no
   longer write new thumbnails. Fix requires `find -delete` (a bare glob hits "Argument list too long") and
   `check.sh` verifies both freed space *and* that thumbnail generation actually works again (not just that `df`
   looks better). Distinct from `disk-full-var-log` (a single dominant log file) and from `disk-inode-exhaustion`
   (no `nr_inodes` cap here -- deliberately a bytes-shaped accumulation, not an inode-shaped one) by being an
   unbounded *count* of small real files in a completely different application domain (image cache, not logs).

4. **`disk-tmpfs-mount-path-mismatch`** (hard) -- ops provisions a dedicated, size-bounded tmpfs at
   `/var/lib/metricsd-buffer` specifically so `metricsd`'s ring buffer can never grow unbounded on the root
   filesystem, but `metricsd`'s own config (`/etc/metricsd/metricsd.conf`) still names the pre-relocation path
   `/var/lib/metricsd/spool` -- an ordinary directory that happens to still exist. `metricsdctl` has a genuine
   safety check (`stat -f -c %T "$SPOOL_DIR"` must report `tmpfs`) and refuses to start rather than silently spool
   onto the root filesystem. Fix: find the real tmpfs mount (`findmnt -t tmpfs`), repoint `SPOOL_DIR` at it via
   `sed -i` (a plain file, not `/etc/hosts`-style special-cased at runtime), restart. `check.sh` confirms not just
   that the process is running but that its live argv actually names the tmpfs path, so a trainee can't pass by
   pointing `SPOOL_DIR` at some other arbitrary writable directory instead of the real bounded mount.

No seed idea from the brief needed to be swapped -- all 4 as originally proposed proved technically workable
within the debian:12-slim / tmpfs constraints once the sizing issue in #2 was corrected.

## Verification results

All 4 went through the full build -> run-with-platform-flags -> check-before (non-zero) -> fix-as-`trainee` ->
check-after (zero) loop, sequentially, per challenge:

- `fs-circular-symlink-blocks-startup`: build clean; run `--network none`; check failed pre-fix
  ("webapp-worker is not running"); fix via `sudo ln -sfn /etc/webapp/profiles/prod /etc/webapp/conf.active` as
  `trainee`; check passed post-fix.
- `disk-stale-lock-file-fills-tmpfs`: build clean; run `--network none --tmpfs
  /var/lib/eventqueue:size=24m,mode=1777`; check failed pre-fix (broker not running, only 4MB free); fix via
  `sudo rm /var/lib/eventqueue/wal.reserved && brokerctl start` as `trainee`; check passed post-fix (running,
  11MB free).
- `disk-thumbnail-cache-never-pruned`: build clean; run `--network none --tmpfs
  /var/cache/photoapp/thumbnails:size=24m,mode=1777`; check failed pre-fix (0MB free, 1229 accumulated files); fix
  via `sudo find /var/cache/photoapp/thumbnails -name 'thumb-orphan-*.jpg' -delete` plus a
  `photoapp-thumbnailer generate` probe as `trainee`; check passed post-fix (24MB free, generation works).
- `disk-tmpfs-mount-path-mismatch`: build clean; run `--network none --tmpfs
  /var/lib/metricsd-buffer:size=16m,mode=1777`; check failed pre-fix (`metricsdctl start` refused, config pointed
  at an `overlayfs` path); fix via `sudo sed -i 's#^SPOOL_DIR=.*#SPOOL_DIR=/var/lib/metricsd-buffer#'
  /etc/metricsd/metricsd.conf && metricsdctl start` as `trainee`; check passed post-fix.

## Real-stack verification (2 of 4, per the brief's minimum)

Ran against the actual dev-override docker-compose stack (already up; `backend` was restarted so
`syncChallengesFromDisk`, which only runs at backend boot per `backend/src/index.ts`, would pick up the 4 new
challenge directories -- confirmed via `docker compose logs backend`, which logged `synced challenge` for all 4
new slugs).

Signed up a throwaway account via `POST /api/auth/signup`, then for both `fs-circular-symlink-blocks-startup` and
`disk-tmpfs-mount-path-mismatch`:
- `POST /api/challenges/<slug>/sessions` started a real session; confirmed the spawned container
  (`devops-trainer-session-<id>`) was running the correctly-tagged lazily-built image
  (`devops-trainer/<slug>:1`), and for the tmpfs case, `docker inspect`'s `HostConfig.Tmpfs` exactly matched
  `challenge.json`'s `tmpfs` field.
- `POST /api/sessions/<id>/check` returned `passed:false` before any fix.
- Applied the real fix via `docker exec -u trainee <container> bash -lc '<fix>'` against the live session
  container.
- `POST /api/sessions/<id>/check` returned `passed:true` after the fix.
- `POST /api/sessions/<id>/stop` cleanly tore down each session container.

Cleaned up afterward: both session containers removed, throwaway account deleted via `DELETE /api/auth/me`. The
lazily-built `devops-trainer/<slug>:1` cached images were left in place intentionally (decision 0004 -- that's the
platform's normal steady state, not test debris).

## Steady state left behind

The dev-override docker-compose stack (`postgres`, `backend`, `frontend`) is left running, per instruction. No
existing challenge directory, `tasks.md`, or `challenges/_schema/` was touched.
