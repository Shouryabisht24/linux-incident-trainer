# 0045 — systemd & services challenges, batch 2 (final 5 of the category)

## Decision

Five new "systemd & services" challenges were authored, bringing the category to 11 total (6 pre-existing +
5 here), as part of the final wave taking the platform from 90 to 100 challenges. All five went through the
full build → break → fix-as-`trainee` → pass verify loop from `AUTHORING.md`, and two were additionally
verified end-to-end through the real running platform (signup → API session start → real container →
`check.sh` fail/pass via the API → cleanup).

Final slugs:

1. **`systemd-missing-after-ordering`** (hard) — `webapp.service` has no `After=`/`Requires=` on
   `data-init.service` (a `Type=oneshot`, `RemainAfterExit=yes` unit that takes ~2s to finish real
   provisioning work). Both units are pulled in by `multi-user.target` and start in parallel on boot, so
   `webapp` always loses the race and fails immediately (`Restart=no`) — but a manual `systemctl restart
   webapp` any time later trivially "fixes" it, since `data-init` has long since finished. `check.sh`
   verifies the static `After=`/`Requires=` dependency is really present on the unit, then replays a genuine
   fresh-boot race (stop both units, wipe the ready marker, start `webapp` cold) so a lucky restart can't
   spoof a pass — only a real ordering fix survives the replay.
2. **`systemd-dropin-port-override`** — the base `webapp.service` correctly sets
   `Environment=LISTEN_PORT=8080` (matching the documented port), but a forgotten debug drop-in at
   `webapp.service.d/override.conf` sets `LISTEN_PORT=9099`, which silently wins (later `Environment=` for
   the same key overrides earlier) with zero error from systemd anywhere. `systemctl status` shows the unit
   perfectly healthy; only `systemctl cat`/`systemctl show -p Environment` reveal the real, merged
   configuration.
3. **`systemd-condition-path-not-met`** — `metrics-agent.service` has
   `ConditionPathExists=/etc/metrics-agent/enabled` gating a per-host rollout flag that provisioning never
   dropped. `systemctl start` "succeeds" and the unit sits `inactive` (never `failed`) forever — deliberately
   distinct from `systemd-masked-service`'s explicit, unambiguous `Loaded: masked`: here `systemctl status`
   shows ordinary `Loaded: loaded` / `Active: inactive (dead)`, with only a `Condition: start condition
   failed` block as the tell.
4. **`systemd-socket-path-mismatch`** (hard) — `notify-relay.socket`'s `ListenStream=` was moved to
   `/tmp/notify-relay.sock` during a migration that never updated clients/docs, which still expect
   `/run/notify-relay.sock`. Both the `.socket` unit (active, listening) and the `.service` unit (inactive,
   correctly waiting to be triggered — normal for `Accept=no` before the first connection) look completely
   healthy individually; the break is only observable by actually connecting at the documented path. The
   relay is a compiled C binary using the `SD_LISTEN_FDS_START` (fd 3) contract, per `AUTHORING.md`'s
   guidance on real listening sockets.
5. **`systemd-missing-environment-file`** — `billing-worker.service`'s
   `EnvironmentFile=-/etc/billing-worker/billing-worker.env` uses the optional `-` prefix, so systemd raises
   zero complaints when the file (never deployed by the secrets pipeline) is missing. The unit loads and
   starts clean; the app's own first-run check (`BILLING_API_KEY` unset) is what actually fails, one layer
   below anything systemd itself would flag.

## Seed swapped: EnvironmentFile "wrong-permission" → "missing/wrong-path"

The original seed idea for #5 offered "missing **or wrong-permission**" file as the break. Wrong-permission
was deliberately not used: `EnvironmentFile=` is read by the systemd **manager** (PID 1, running as root)
before it forks and drops privileges to any configured `User=` — so a permission bit that blocks the
service's own unprivileged user has no effect on whether systemd itself can read the file. This is exactly
the failure mode `decisions/0007` warns about (root ignores DAC permission checks), and it would have shipped
a fake break, same as the very first `perm-config-blocks-service` mistake that decision documents. The
"missing, with the optional `-` prefix" variant is the one that's real: it's the only way `EnvironmentFile=`
produces zero systemd-level signal while still causing genuine runtime failure, and it's what the seed idea's
own framing ("starts but immediately fails ... due to missing env vars") actually requires.

No other seed swaps were needed; ideas 1–4 shipped close to their original framing.

## A repo-wide pitfall confirmed live, not previously documented

Every `systemctl`/`journalctl` invocation as the unprivileged `trainee` user **requires `sudo`, even for
read-only queries** (`systemctl status`, `is-active`, `show`, `journalctl -u`) — confirmed by testing both
this batch's containers and the pre-existing `systemd-masked-service` reference template. This container
image has no D-Bus daemon and `/run/systemd/private` is root-only (`srwx------`), so a non-root, non-session
`systemctl` call fails outright with `Failed to connect to bus: No such file or directory`, and non-root
`journalctl` silently returns "No entries" (ACL, not bus-based, but still needs root to see anything). All
five new challenges' `hints.json`/`solution.md` consistently `sudo`-prefix every systemctl/journalctl call for
this reason. Existing shipped challenges' hints (e.g. `systemd-masked-service`'s "`systemctl status nginx`"
without `sudo`) predate this finding and were left untouched per the "do not touch existing challenges" scope
of this batch — worth a follow-up pass if another systemd batch is ever authored.

## Verification results

All five passed the full loop in `AUTHORING.md` (`docker build` clean → run with
`--cap-add SYS_ADMIN --tmpfs /run --tmpfs /run/lock -v /sys/fs/cgroup:/sys/fs/cgroup:rw` → `check.sh`
non-zero before any fix → fix applied via `docker exec -u trainee` → `check.sh` exits 0 after), worked
through strictly sequentially as instructed:

| slug | pre-fix check | fix as trainee | post-fix check |
|---|---|---|---|
| systemd-missing-after-ordering | exit 1 ("no After=data-init.service") | added `Requires=`/`After=data-init.service`, daemon-reload, restart | exit 0 |
| systemd-dropin-port-override | exit 1 ("nothing answered on port 8080") | removed the stale `override.conf` drop-in, daemon-reload, restart | exit 0 |
| systemd-condition-path-not-met | exit 1 ("inactive") | created `/etc/metrics-agent/enabled`, started | exit 0 |
| systemd-socket-path-mismatch | exit 1 ("nothing answered on /run/...") | fixed `ListenStream=` back to `/run/notify-relay.sock`, stop/reload/start | exit 0 (confirmed stable across 3 repeated fresh-container runs) |
| systemd-missing-environment-file | exit 1 ("failed") | created `/etc/billing-worker/billing-worker.env` with `BILLING_API_KEY`, restarted | exit 0 |

Real-platform (API) verification — two challenges, both including a fresh signup, session start via
`POST /api/challenges/<slug>/sessions`, `docker exec -u trainee` into the real session container, and the
real `/check` endpoint:

- **`systemd-missing-after-ordering`**: confirmed `docker exec <real-session-container> ps -p1` shows PID 1
  is genuinely `systemd` (not a simulated supervisor). `POST /sessions/:id/check` returned
  `{"passed": false, "output": "webapp.service has no After=data-init.service\n"}` before the fix; after
  fixing as `trainee` inside the real container, the same endpoint returned
  `{"passed": true, "output": "webapp.service correctly waited for data-init.service\n"}`.
- **`systemd-socket-path-mismatch`**: `POST /sessions/:id/check` returned `{"passed": false, "output":
  "nothing answered on /run/notify-relay.sock\n"}` before the fix, and `{"passed": true, "output":
  "notify-relay answered on /run/notify-relay.sock\n"}` after the fix, applied the same way.

Both sessions were stopped afterward (`POST /sessions/:id/stop`) and the throwaway test account was deleted
(`DELETE /api/auth/me`), confirmed by a subsequent `GET /api/auth/me` returning `invalid or expired token`.

One operational note from working on shared live infrastructure: a mid-verification `docker compose restart
backend` (necessary to pick up new challenges from disk, since `syncChallengesFromDisk` only runs at boot)
coincided with another concurrent restart — almost certainly the parallel SSH-challenges agent (batch
`0046`) doing the same for their own work — which drained an in-progress session via
`drainAllActiveSessions()`'s graceful-shutdown path. Re-running the same session-start/check/fix/check
sequence immediately afterward succeeded cleanly with no changes needed; this is a shared-stack timing
artifact, not a bug in any of the five challenges.

`content_version: 1` on all five (freshly authored, nothing to bump from).
