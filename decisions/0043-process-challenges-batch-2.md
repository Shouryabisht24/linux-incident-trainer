# 0043 — Process & Performance batch 2: 5 more challenges (LimitNOFILE, CPU affinity, nice, pids ceiling, hung dependent service)

## Decision

Added 5 new Process & Performance challenges, all built from scratch and verified sequentially (not in
parallel), continuing the category from the 5 already shipped
(`proc-fd-leak-too-many-open-files`, `proc-memory-leak-runaway`, `proc-runaway-cpu`, `proc-stale-pidfile`,
`proc-zombie-process-leak`) without duplicating any of their scenarios:

1. **`proc-limitnofile-ceiling-too-low`** (intermediate, `requires_systemd: true`) — `apiworker.service`'s
   `LimitNOFILE=30` is a pure systemd resource-limit *configuration ceiling*, too low for the 40 connections
   the app genuinely needs at steady state. The app itself has no leak at all — distinct from
   `proc-fd-leak-too-many-open-files` (a hand-rolled `ulimit -n` config read by a custom control script) by
   being a native `LimitNOFILE=` unit directive, fixed via `systemctl edit`/`daemon-reload`/`restart`.
2. **`proc-cpu-affinity-starvation`** (hard) — `render-worker` is wedged via `taskset` onto the same CPU core
   a separate, legitimate workload (`batch-encoder`) already fully saturates, starving it despite idle cores
   elsewhere. Fixed by clearing its `PINNED_CORE` config (or live `taskset -pc`).
3. **`proc-nice-priority-starvation`** (intermediate) — `telemetry-agent`, a background scraper that per
   runbook must always run deprioritized, regressed to `nice 0` in a redeploy and now evenly splits CPU with
   the important `batch-report-job`. Fixed with `renice`.
4. **`proc-pidslimit-fork-exhaustion`** (hard) — `pool-supervisor` has no upper bound on its worker pool and
   keeps adding workers as long as this container's own `pidsLimit` cgroup has any headroom at all, pinning
   the box right at its process-count ceiling. Fixed by stopping the supervisor and cleaning up every leaked
   worker.
5. **`proc-hung-dependent-service`** (hard) — `event-shipper` is genuinely, indefinitely blocked (not a
   zombie, not spinning CPU) opening a FIFO for writing because its reader companion (`log-collector`) was
   dropped from a services config list and never started. Diagnosed via `/proc/<pid>/status` (`State: S`)
   and `/proc/<pid>/wchan` (`wait_for_partner`) — a different diagnostic path than any existing process
   challenge.

All 5 seed ideas from the task brief turned out to be technically workable in this container after testing,
though two required real design changes to actually work as intended (documented below); none were replaced
with a wholly different scenario.

## Notable authoring decisions / things that didn't work on the first try

### 1. `proc-cpu-affinity-starvation`: the category's usual 0.5 vCPU premise actively defeats this scenario

Empirically tested before writing anything: under this container's usual tight `cpus: 0.5` quota, pinning a
"starved" process and its competitor to the same core and then moving the starved one to a different, idle
core made throughput **worse**, not better (repeatable across trials). Root cause: Linux's CFS bandwidth
controller (`cpu.max`) shares one quota bucket across however many distinct cores a cgroup's tasks end up
running on; spreading a low aggregate quota (0.5 core) across multiple physical cores fragments it and
produces *more* throttling stalls than confining it to one core — the opposite of the lesson this challenge
is supposed to teach. Raising the container's quota to `cpus: 2` (this challenge's one deliberate deviation
from the category's usual tight-CPU premise, chosen after confirming empirically that 0.5 inverts the
effect) restored the expected, clean result: pinned to a contended core, `render-worker` got roughly half a
core's throughput (~100 CPU ticks/2s); moved to any free core, it saturated close to a full core (~200 ticks/2s)
even though `batch-encoder` never stopped hogging core 0. `check.sh` measures real CPU ticks
(`utime+stime` from `/proc/<pid>/stat`) rather than raw loop-iteration counts specifically so the pass/fail
threshold (150 ticks/2s, squarely between the ~100 broken and ~200 fixed states measured here) is portable
across host CPU speeds rather than tied to this machine's clock.

### 2. `proc-nice-priority-starvation`: this container's root has no `CAP_SYS_NICE` — niceness is one-way

Verified directly: `nice -n -19 someprocess` (as root, via plain `docker exec`, no `-u` restriction) silently
fails with `Permission denied` and the process starts at nice 0 regardless of what was requested — and
`renice` **down** to any value, even from 19 to 18, fails the same way, for root as much as `trainee`. Only
*raising* a process's niceness (deprioritizing it) is ever possible here, for anyone, at any starting value.
This ruled out the originally-imagined "competing process was niced very negative" framing entirely (it's
simply not constructible in this image) and reshaped the challenge around the one fix direction that's
actually available: the competing process (`telemetry-agent`) starts at the regressed default (`nice 0`)
and the fix is `renice`ing *it* up to its documented value, never touching the important job's own priority.
`check.sh` also needed to be host-speed-independent, so instead of an absolute throughput threshold it
compares the *ratio* of CPU ticks between the two competing processes over a short window
(`batch-report-job`'s share of their combined ticks) — measured here at ~50% broken (both nice 0, forced
onto the same core so niceness has any effect at all — unpinned, this box's many visible cores let the
scheduler spread them out and niceness stops mattering) vs. ~96% fixed (competitor reniced to 15).

### 3. `proc-pidslimit-fork-exhaustion`: killed leaked children don't free cgroup pid slots without a reaper

The first version of this challenge was unsolvable, caught only by actually running the fix during
verification: `kill -9`ing every leaked `job-worker` process left `pids.current` completely unchanged.
Confirmed why: a process killed with nothing ever calling `wait()`/`waitpid()` on it becomes a permanent
zombie (per this repo's well-known pitfall about this container's PID 1 never reaping), and **a zombie still
counts against a `pids` cgroup's current count** until reaped — it isn't a free slot just because the process
is dead. This container's other process challenges never hit this because their fix is "stop the one
offending process," not "recover cgroup headroom," so a lingering zombie doesn't affect their pass/fail
check. This challenge's whole premise is the `pids` ceiling itself, so it needed a real fix: PID 1 here is a
small `while true; do wait || sleep 1; done` reap loop instead of this repo's usual bare `sleep infinity` —
documented inline in the Dockerfile as a deliberate, scoped exception (equivalent to what a real host's init,
or `docker run --init`, already does for you). With that in place, killing the supervisor and every PID in
its own spawn registry (`/var/run/worker-pool/pids` — not a name-based `pkill`, since each worker execs into
`sleep infinity` and its `comm` is indistinguishable from any other `sleep`) correctly dropped
`pids.current` from ~38/40 to ~5/40. The supervisor's own throttling was also tuned to check
`/sys/fs/cgroup/pids.current` vs `pids.max` directly and back off to a long retry interval once headroom
drops below a small margin, rather than hammering `fork()` every second forever — verified this keeps the
box usable (new `docker exec`s reliably succeed) rather than risking the fully-saturated "no exec can start
at all" state also observed during testing when headroom hit zero.

### 4. `proc-hung-dependent-service`: a real, indefinite FIFO block, verified precisely

Confirmed directly rather than assumed: a process opening a named pipe for writing with no reader ever
present blocks in the kernel indefinitely, in interruptible sleep (`State: S`), with `/proc/<pid>/wchan`
reporting the exact, readable `wait_for_partner` — genuinely distinct from every existing process
challenge's diagnostic signal (CPU%, zombie state, fd count). Starting the missing reader (`log-collector`)
unblocks the writer (`event-shipper`) immediately with no restart needed, confirmed by watching `wchan`
change to `do_wait` (its normal `sleep 2` cycle) the instant the reader appears. `check.sh` verifies real
end-to-end data flow (the collected-events log growing over a ~3s window) rather than just process
liveness, so a coincidentally-alive-but-still-stuck `event-shipper` can't false-pass.

## Verification results

All 5 went through the full loop (`docker build` → run with the real platform flags, including
`requires_systemd`'s `--cap-add SYS_ADMIN --tmpfs /run --tmpfs /run/lock -v
/sys/fs/cgroup:/sys/fs/cgroup:rw` for challenge 1 — `docker.service.ts`'s exact `createSessionContainer`
flags were read directly, not guessed) → `check.sh` fails before the fix → fix applied as `trainee` via
`docker exec -u trainee` → `check.sh` passes after — clean PASS on every one, worked sequentially. Verify
images/containers were removed after each challenge; only this repo's own `verify/*` images from this batch
were touched (other agents' pre-existing `verify/*` images from other batches were left alone).

Two went through the real stack per the task brief (`docker compose restart backend` to pick up all 5 new
`challenge.json`s via `syncChallengesFromDisk` — confirmed in backend logs, all 5 slugs synced with correct
hint counts):

- **`proc-limitnofile-ceiling-too-low`**: throwaway account signed up, `POST
  /api/challenges/proc-limitnofile-ceiling-too-low/sessions` started a real session, `POST
  /api/sessions/:id/check` returned `passed:false` (30 fds) before the fix, the same fix applied via `docker
  exec -u trainee` into the real session container, `passed:true` (43 fds) after, session stopped via `POST
  /api/sessions/:id/stop` (container confirmed torn down via `docker ps`).
- **`proc-hung-dependent-service`**: same account, new session via `POST
  /api/challenges/proc-hung-dependent-service/sessions`, `passed:false` ("log-collector is not running")
  before the fix, `passed:true` (events.log growing) after applying the config fix + `svc-ctl start
  log-collector` as `trainee` in the real container, session stopped and container torn down.

The throwaway account was deleted via `DELETE /api/auth/me` at the end (confirmed: its token immediately
rejected as invalid afterward). No leftover `devops-trainer-session-*` or `verify/*` containers/images from
this batch remain; the dev-override compose stack (`postgres`/`backend`/`frontend`) was left running as the
steady state, with `backend` restarted once (required to sync these 5 new challenges) and otherwise
untouched.
