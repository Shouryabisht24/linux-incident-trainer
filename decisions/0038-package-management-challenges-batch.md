# 0038 — Package Management batch: 5 new challenges from scratch

## Decision

Added 5 new Package Management challenges, bringing the category from 4 to 9. A previous attempt at
this category failed before writing anything, so this batch started from an empty slate (only the 4
pre-existing challenges — `pkg-broken-alternatives`, `pkg-dpkg-unconfigured`,
`pkg-missing-shared-library-symlink`, `pkg-stale-dpkg-lock-file` — existed beforehand and were left
untouched).

Final 5 slugs, one per seed idea from the task brief:

1. **`pkg-apt-mark-hold-blocks-upgrade`** (beginner) — `apt-mark hold` left over from an old incident
   freeze silently blocks an upgrade to a version already sitting in the internal mirror. No seed swap.
2. **`pkg-conflicting-pin-priorities`** (hard) — two `/etc/apt/preferences.d/*` files (an old
   incident-freeze pin at priority 1001, a later rollout pin at 500) conflict, so apt keeps resolving
   the old, buggy version as `Candidate` no matter what's installed. No seed swap.
3. **`pkg-ssl-cert-postinst-never-ran`** (intermediate) — the `ssl-cert` package's dpkg bookkeeping is
   fully "installed and configured," but the actual snakeoil cert/key its postinst generates was never
   produced on this (cloned) host. Deliberately different failure mode from `pkg-dpkg-unconfigured`:
   `dpkg --audit` is clean and `dpkg --configure -a` is a no-op here; the fix is
   `dpkg-reconfigure ssl-cert` (re-running the package's actual generation step), not dpkg's configure
   step. No seed swap.
4. **`pkg-stale-sources-list-entry`** (beginner) — a decommissioned internal mirror's
   `sources.list.d` entry (pointing at a path that no longer exists) breaks `apt-get update` for the
   whole host, even though the one real, still-healthy internal mirror is fine. Framed entirely around
   local `file://` mirrors since real internet is unavailable (`NetworkMode: none`); no seed swap
   needed once local-mirror plumbing was in place.
5. **`pkg-force-removed-shared-lib`** (hard) — `dpkg -r --force-depends libfoo1` removed a shared
   library package that another installed package (`clientapp`) still depends on. dpkg's bookkeeping
   for `libfoo1` itself stays internally consistent (that's why `dpkg --audit` finds nothing) — the
   inconsistency is the *cross-package* dependency relationship, surfaced by `apt-get check`, not by
   dpkg's own audit. Fix is `apt-get install libfoo1` (reinstall through the package manager, which
   restores both the file and the bookkeeping), not copying the `.so` back by hand. No seed swap.

None of the 5 seed ideas needed a scenario swap — all were technically workable inside
`debian:12-slim` / `NetworkMode: none` once each challenge established its own local `file://` apt
mirror at build time (see below).

## Key technique: local `file://` apt mirrors, not real network access

Challenges 1, 2, 4, and 5 all need real, working `apt-mark`/`apt-cache policy`/`apt-get
install`/`apt-get check` behavior against more than one package version — not achievable by hand-editing
`/var/lib/dpkg/status` alone. Each of those challenges bakes a real, custom `.deb`-based apt repository
into the image at build time:

- Build one or more fake internal packages with `dpkg-deb --build --root-owner-group` (control file +
  payload written by `seed.sh`).
- Index them with `dpkg-scanpackages . /dev/null > Packages` (`dpkg-dev` installed for this, then
  purged afterward to keep the image lean).
- Point a `sources.list.d` entry at it: `deb [trusted=yes] file:///opt/pkg-repo ./`.

`file://` is pure local disk I/O — no network syscalls — so `apt-get update`/`install` all work for
real under `NetworkMode: none`, with zero risk to `docker build` (nothing to time out or fail to
resolve).

Two sharp edges hit during verification, both now folded into each affected `seed.sh`'s comments:

1. **`dpkg-scanpackages` silently drops multi-version packages by default.** Challenges 1 and 2 each
   need *two* versions of the same package name in one repo (the old and the fixed version). Without
   `--multiversion`, `dpkg-scanpackages` keeps only the highest version and emits an easy-to-miss
   warning about it — the resulting `Packages` index then only ever offers the newer version, and
   `apt-get install pkg=<old-version>` fails at build time with "version not found." Fixed by always
   passing `dpkg-scanpackages --multiversion`.
2. **Modern `debian:12-slim` ships its default mirror as `/etc/apt/sources.list.d/debian.sources`
   (deb822 format), not the classic `/etc/apt/sources.list`.** `pkg-stale-sources-list-entry` needs a
   genuinely internet-free baseline so its runtime `apt-get update` check can actually succeed once
   fixed — blanking only `/etc/apt/sources.list` left the real `deb.debian.org` deb822 entry active,
   which would always fail under `NetworkMode: none` regardless of the trainee's fix. Fixed by removing
   `/etc/apt/sources.list.d/debian.sources` explicitly in `seed.sh`, in addition to blanking
   `sources.list`.

`pkg-force-removed-shared-lib` also hit two build-time snags worth noting for future package
challenges:
- Linking a client binary against a shared lib with no `-dev` symlink (only `libfoo.so.1`, no
  unversioned `libfoo.so`) fails at `gcc` link time (`cannot find -lfoo`) — fixed by linking with the
  exact SONAME via `-l:libfoo.so.1` instead of shipping a dev symlink.
- After the intentional `dpkg -r --force-depends libfoo1` break, `apt-get` itself refuses **any**
  further operation host-wide ("E: Unmet dependencies") until the dependency is resolved — including
  `seed.sh`'s own post-break cleanup (`apt-get purge -y dpkg-dev`). Plain `dpkg --purge dpkg-dev` (not
  `apt-get`) doesn't perform that whole-system consistency check, so it was used instead for cleanup
  steps that must run after the break is already in place.

## Verification

All 5 challenges went through the full loop from `challenges/AUTHORING.md` (`docker build` →
run with `--network none --memory 128m --pids-limit 50 --cpus 0.5` → `check.sh` before fix (confirmed
non-zero) → fix applied via `docker exec -u trainee` → `check.sh` after fix (confirmed `0`)) before
anything shipped. `pkg-apt-mark-hold-blocks-upgrade` and `pkg-force-removed-shared-lib` were
additionally verified against the real running stack: signed up a throwaway account via
`POST /api/auth/signup`, restarted the `backend` container so `syncChallengesFromDisk` picked up all 5
new directories (confirmed via `docker compose logs backend`, all 5 slugs synced with correct hint
counts), started real sessions via `POST /api/challenges/<slug>/sessions`, confirmed
`POST /api/sessions/:id/check` returned `passed: false` before the fix and `passed: true` after
applying the same fix as `trainee` inside the real session container (`devops-trainer-session-<id>`),
then stopped both sessions via `POST /api/sessions/:id/stop` (containers confirmed torn down) and
deleted the throwaway account via `DELETE /api/auth/me`.

Local `verify/*` test images built during this batch were removed after verification; the dev-override
compose stack (`postgres` + `backend` + `frontend`) was left running as the steady state, per the
existing convention this batch found it in.
