# 0037 — Cron & Scheduling batch 2: 3 more challenges (timer catch-up, overlap locking, timezone)

## Decision

Added the final 3 of 9 total Cron & Scheduling challenges (a prior attempt had already shipped 2 of
the remaining 4 before failing; this batch closes out the category). All 3 seed ideas from the task
brief turned out to be technically workable in this container (debian:12-slim / systemd-in-Docker /
`NetworkMode: none`), so none were swapped for an alternative:

1. **`cron-timer-missing-persistent`** (intermediate, `requires_systemd: true`) — a systemd timer
   unit missing `Persistent=true`, so a scheduled run missed while the timer was disabled during a
   maintenance freeze never gets made up once it's re-enabled.
2. **`cron-overlapping-job-no-lock`** (hard) — a cron job that can still be running when the next
   minute's invocation starts, with no locking around its shared-state read-modify-write, so
   overlapping runs silently lose updates. Fixed with `flock`.
3. **`cron-timezone-mismatch`** (intermediate) — a box provisioned with the wrong local timezone, so
   a cron schedule written assuming UTC (matching the rest of the fleet) actually fires hours off from
   every other box's identical `0 2 * * *` entry.

## Notable authoring decisions / things that didn't work on the first try

### 1. `cron-timer-missing-persistent`: forging systemd's own stamp file, not the unit file's mtime

The first hypothesis — backdate the *timer unit file's* own mtime and let systemd use that as the
"last trigger" fallback reference for catch-up detection — turned out to be a red herring. A
controlled A/B test (one timer with a freshly-built unit file, one with its mtime backdated 2 days,
both `Persistent=true`, both scheduled for a time-of-day already safely in the past) showed **neither**
caught up: on a timer's very first-ever activation in a systemd instance, with no pre-existing
`/var/lib/systemd/timers/stamp-<unit>.timer` file, systemd just adopts "now" as its baseline and
waits for the next natural occurrence — there is no catch-up on a truly first activation, matching the
documented "recovers from *reboot/outage* downtime" semantics, not "recovers from never having run."

The real, working mechanism (confirmed empirically before writing the challenge): the stamp file at
`/var/lib/systemd/timers/stamp-<unit>.timer` is an **empty marker file whose mtime alone** systemd
reads as "when this timer last fired," for timers with `Persistent=true`. `seed.sh` forges this
directly at build time (`touch -d "3 days ago" /var/lib/systemd/timers/stamp-nightly-reconcile.timer`)
so a genuinely-missed occurrence exists to catch up on, independent of the *timer unit file's* own
mtime (which the trainee necessarily changes the instant they edit it to add `Persistent=true` — if
the mechanism had depended on that file's mtime, the fix itself would have destroyed the fixture).
Verified end-to-end: without `Persistent=true` + the forged stamp, `systemctl enable --now` produces
no catch-up run; with it, the service fires immediately on activation.

### 2. `cron-overlapping-job-no-lock`: race verified by real concurrent execution, not by grepping for `flock`

Per decision 0007's spirit ("verify by running the real fix path"), `check.sh` doesn't check the
script text for the word `flock` (which could be cargo-culted incorrectly — e.g. locking the wrong
file, or non-exclusive). It launches 6 real concurrent invocations of the job (as `trainee`, via `su`,
bypassing cron's own scheduler rather than waiting on real minute-boundary overlap) against a reset
baseline counter and asserts the final total is *exactly* 6. Unlocked, a 0.5s injected "work" sleep
between read and write reliably collapses all 6 concurrent reads onto the same stale value, so the
final total lands at 1 (confirmed repeatably). A correct `flock -x`-based fix serializes them and the
total lands at exactly 6, confirmed repeatably across multiple check.sh re-runs.

One fixture bug caught by the verification loop itself: `seed.sh` originally left
`/var/lib/app/total-processed` and its parent directory root-owned, so the job — which runs as
`trainee` per its own cron.d entry — couldn't write to it at all (`Permission denied`), which the
first pre-fix `check.sh` run surfaced immediately as an all-processes-fail result rather than the
intended race. Fixed by `chown trainee:trainee` on the state dir/file (and the log file) in `seed.sh`,
consistent with the non-negotiable rule: state a non-root job actually needs to touch must actually be
writable by that non-root user.

### 3. `cron-timezone-mismatch`: verifying via live UTC offset, not by grepping `/etc/timezone` text

`check.sh` checks the *live* `date +%z` offset (must be `+0000`) rather than asserting one exact
timezone-name spelling, so any equivalent fix (`UTC`, `Etc/UTC`, `Etc/GMT`, etc.) passes. It then also
re-runs the actual report script as `trainee` to confirm the fix didn't silently break anything else.
`debian:12-slim` already ships `tzdata` with real zoneinfo files, so no extra package surprises;
`America/Los_Angeles` was used as the seeded wrong timezone (large, obviously-wrong UTC offset,
familiar to any reader).

## Verification results

All 3 went through the full loop (`docker build` → run with real flags → `check.sh` fails before
fix → fix applied as `trainee` via `docker exec -u trainee` → `check.sh` passes after, re-run to
confirm repeatability) with a clean PASS, verified sequentially (not in parallel) to avoid the Docker
resource contention that stalled the earlier large parallel batch. Verify-only containers/images were
removed after each challenge.

`cron-timezone-mismatch` additionally went through the real stack: backend restarted to pick up all 3
new `challenge.json`s via `syncChallengesFromDisk` on boot (confirmed in backend logs — all 3 slugs
synced cleanly), a throwaway account signed up, a real session started via
`POST /api/challenges/cron-timezone-mismatch/sessions`, `POST /api/sessions/:id/check` confirmed
`passed: false` before the fix and `passed: true` after applying the same fix as `trainee` inside the
real session container (found via `docker ps --filter label=sessionId=...`), the session stopped via
`POST /api/sessions/:id/stop` (container torn down, confirmed via `docker ps`), and the throwaway
account deleted via `DELETE /api/auth/me`.

Leftover `verify-*` containers from an earlier, apparently-abandoned attempt
(`verify-disk-core`, `verify-csf`) were found still running at the start of this batch and removed as
routine cleanup; no files belonging to other challenges were touched.
