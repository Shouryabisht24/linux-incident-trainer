# 0040 — Logs & journald challenges, second batch (5 new)

## Decision

Added 5 new "Logs & journald" challenges, bringing the category from 4 to 9. Final slugs:

1. `logs-logrotate-create-wrong-owner` — logrotate's `create` directive stamps the post-rotation file
   `root:root 0600`, locking the real, unprivileged `orderapi` service account out of its own fresh log.
2. `logs-journald-storage-none` — `Storage=none` in a `journald.conf.d` drop-in means journald retains
   nothing at all, not even within the current boot (distinct from `logs-journald-not-persistent`'s
   `Storage=volatile`, which *is* queryable in the current boot, just not across a reboot).
3. `logs-rsyslog-facility-collision-mail` — `shipnotify`'s logging wrapper hardcodes facility `mail`
   instead of the `local3` its dedicated rsyslog rule expects; messages are legitimately caught by rsyslog's
   stock, unmodified default `mail.*  -/var/log/mail.log` rule instead.
4. `logs-dead-symlink-destination` — `reportd`'s configured log path is a symlink into a decommissioned
   archive directory that no longer exists; the app's fire-and-forget logger swallows the resulting `ENOENT`.
5. `logs-journald-forward-to-syslog-disabled` — `ForwardToSyslog=no` in a `journald.conf.d` drop-in silently
   cuts rsyslog off from every journal entry, breaking a downstream per-app rsyslog rule that depends entirely
   on that forwarded feed (journald itself keeps working fine; `journalctl` shows the messages the whole time).

All 5 seed ideas from the assignment were used as originally proposed — none needed to be swapped.

## Why these mechanisms, and what was validated before committing to them

Per `decisions/0016` and `AUTHORING.md`'s explicit warning, journald's own *runtime self-enforcement*
(rate-limiting, directory-permission self-healing) is unreliable to build a challenge around in this
environment. Both journald challenges here (`#2`, `#5`) are pure *config* (`Storage=`, `ForwardToSyslog=` in
`journald.conf.d/` drop-ins) — exactly the category `0016` says is fine — never journald policing itself.

Before writing any files, exploratory testing was done in a throwaway container (`debian:12-slim` +
`systemd`/`rsyslog`, run with `--tmpfs /run --tmpfs /run/lock --cap-add SYS_ADMIN -v
/sys/fs/cgroup:/sys/fs/cgroup:rw`) to de-risk the two journald ideas specifically, since `0016` had already
burned two other journald ideas late in a build cycle:

- **`Storage=none`** was confirmed to produce zero `journalctl` output for a message sent moments earlier
  (not just "gone after reboot" — gone immediately), clearly distinct from the existing
  `logs-journald-not-persistent` challenge's `Storage=volatile`. Switching to `Storage=auto` restored
  immediate queryability.
- **`ForwardToSyslog=`** required confirming the actual local wiring first: on this stock Debian rsyslog
  install, `rsyslogd`'s `imuxsock` module acquires `/run/systemd/journal/syslog` from systemd (confirmed via
  `systemctl status rsyslog`) rather than tailing the journal directly — so rsyslog's ordinary, correct
  per-program rules only ever see what journald chooses to forward over that socket. Setting
  `ForwardToSyslog=no` and sending a message via `logger` reliably produced "in the journal, absent from
  `/var/log/syslog` and from a dedicated per-program rsyslog rule"; flipping it back to `yes` and restarting
  `systemd-journald` restored the pipeline every time. This reproduced cleanly and repeatably, unlike the two
  ideas `0016` abandoned.

For the rsyslog-facility idea (`#3`), the base `/etc/rsyslog.conf` shipped by the Debian `rsyslog` package was
inspected directly (`mail.*  -/var/log/mail.log` is a real, unmodified stock default, not something authored
for this challenge) to make sure the "legitimate rule elsewhere" framing was true rather than invented.

For the logrotate idea (`#1`), the first draft of `check.sh` had a real idempotency bug: it required the log
file to be non-empty as a setup-sanity precondition, but its own prior invocation (via `logrotate --force`)
truncates the file to empty on success — so a second `check.sh` run after a genuine fix would have falsely
reported "setup problem" and failed. Fixed by having `check.sh` top the file back up (as root) whenever it
finds it empty, before forcing rotation, making repeated `check.sh` invocations safe (a real pitfall worth
flagging for future logrotate-adjacent challenges: **anything using `copytruncate` or a `create` directive
truncates/replaces the log on every successful rotation, so a "must start non-empty" precondition in
`check.sh` is not safely re-runnable**).

## Verification results

All 5 went through the full build → run-with-real-flags → check-before (non-zero) → fix-as-`trainee` →
check-after (0) loop, one at a time (not in parallel), per the batch instructions:

| Slug | Build | Check before fix | Fix as trainee | Check after fix |
|---|---|---|---|---|
| `logs-logrotate-create-wrong-owner` | clean | exit 1 (permission denied) | `sed` the `create` line via `sudo` | exit 0 |
| `logs-journald-storage-none` | clean | exit 1 (no entries) | `sed` + `systemctl restart systemd-journald` via `sudo` | exit 0 |
| `logs-rsyslog-facility-collision-mail` | clean | exit 1 (landed in `/var/log/mail.log` instead, confirmed) | `sed` the wrapper's `-p` flag via `sudo` | exit 0 |
| `logs-dead-symlink-destination` | clean | exit 1 (`ENOENT` swallowed) | recreate the destination as a real file via `sudo` | exit 0 |
| `logs-journald-forward-to-syslog-disabled` | clean | exit 1 (journal had it, syslog file didn't) | `sed` + `systemctl restart systemd-journald` via `sudo` | exit 0 |

`logs-logrotate-create-wrong-owner`'s check was additionally re-run a third time post-fix to confirm the
idempotency fix above actually holds (exit 0 both times).

**Real-stack verification** (2 of 5, per the assignment's minimum): a throwaway account was signed up via
`POST /api/auth/signup`. `syncChallengesFromDisk` (`backend/src/index.ts`) only runs once, at backend process
boot — it does **not** pick up new challenge directories from a running process, even though `backend/src` is
bind-mounted for hot reload in the dev override. A `docker compose restart backend` was required and was
sufficient (no image rebuild needed, since `./challenges` is a separate bind mount already present in the
running container). Backend logs confirmed all 5 new slugs synced. Two real sessions were then driven
end-to-end through the actual HTTP API (`POST /api/challenges/:slug/sessions`, `POST
/api/sessions/:id/check`, `POST /api/sessions/:id/stop`) with the fix applied via `docker exec -u trainee`
into the real spawned session container:

- `logs-logrotate-create-wrong-owner`: API check returned `{"passed":false}` before the fix, `{"passed":true}`
  after.
- `logs-journald-forward-to-syslog-disabled`: same pattern, `{"passed":false}` → `{"passed":true}`.

Both sessions were stopped via the API afterward (containers confirmed removed), and the throwaway account
was deleted via `DELETE /api/auth/me`. Note: this dev stack had other concurrent activity during
verification — an unrelated session container from a different user was observed running alongside these
tests throughout, consistent with another agent working on a different category batch at the same time; it
was left untouched. One of my own sessions' containers was also found already gone (backend had restarted
twice in quick succession between session-create and check, likely from concurrent unrelated work touching
`backend/src` and triggering `tsx watch`) — re-created immediately and re-verified with no further issue.

## Cleanup

Local `verify/*` test images and containers built during the per-challenge build→break→fix loop were removed
after each challenge passed. The throwaway `verify-logs-batch@example.com` account, both of its real session
containers, and its DB rows were all removed via the real API by the end of this batch. The dev-override
`docker compose` stack (`postgres`, `backend`, `frontend`) was left running, per instructions.
