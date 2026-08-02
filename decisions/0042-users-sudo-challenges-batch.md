# 0042 — Users/groups/sudo challenges, third batch (5 new)

## Decision

Added 5 new "Users, groups & sudo" challenges (`users-groups-sudo` category), bringing it from 5 to 10.
Final slugs:

1. `sudoers-dropin-syntax-error` — a `/etc/sudoers.d/` drop-in meant to grant `netops` passwordless sudo has
   a typo (missing closing paren) that sudo's parser silently discards, leaving netops with no effective
   grant at all even though something was clearly written for it. `visudo -c` is the diagnostic.
2. `user-primary-group-mismatch` — `dataexport`'s **primary** GID (not supplementary group membership) is
   wrong, so every file it creates in a non-setgid directory comes out group-owned by its own private
   group instead of `exportreaders`, leaving `analyst` unable to read fresh exports the instant they land.
3. `user-shell-binary-missing` — `reportbot`'s `/etc/passwd` shell field points at
   `/usr/local/sbin/corp-shell`, a custom wrapper binary that was never actually installed; `exec()` fails
   with `ENOENT` before anything resembling a shell runs.
4. `user-duplicate-uid` — `logshipper` (legitimate, pre-existing) and `metricsagent` (created later via
   `useradd --non-unique`) both claim UID 1301; `getent passwd 1301`/`ls -l` can only ever show one name for
   that UID, hiding the collision from the tools an admin would normally reach for first.
5. `user-password-expired-chage` — `backupsvc`'s password-aging `chage -d 0` sentinel forces an immediate,
   interactive password change that a non-interactive `su -` can never satisfy; distinct from
   `user-account-locked`'s hard `chage -E` account expiry.

## Seed swap: idea #1 (sudoers drop-in syntax error)

The original seed idea was "a syntax error in a sudoers.d drop-in causes **all** sudo usage on the box to
fail." This was empirically tested against this image's actual sudo build (Debian 12, sudo 1.9.13p3) before
committing to it, and the premise did not hold:

- A syntax error in one `sudoers.d` file (tested: unterminated quote, unknown `Defaults` entry, dangling
  `User_Alias`, missing paren, missing `=`) never took down sudo for *other* users whose grants live
  elsewhere — not even for a second, valid line in the *same* broken file. sudo's parser discards only the
  malformed rule(s) and keeps going; `trainee`'s separate grant, directly in `/etc/sudoers`, worked
  throughout every variant tried.
- Even if a "break everything" version had worked, it would have been self-defeating for this container
  contract specifically: `trainee` always needs *working* passwordless sudo to perform the fix at all, so a
  challenge whose premise is "sudo is completely broken for everyone, including trainee" would be
  unsolvable by construction.

What *does* reproduce reliably and is a real, distinct failure mode from `sudo-missing-privilege`: a syntax
error inside the **specific user's own** grant file breaks sudo for exactly that user (confirmed:
`sudo -u netops sudo -n id` → `sudo: a password is required`, not the "not in the sudoers file" message
`sudo-missing-privilege` produces), while `visudo -c` pinpoints the exact broken file and line. The
challenge was rewritten around this: `netops` has a real grant on disk, in the theoretically-correct place,
that still doesn't work — a more confusing and arguably more realistic on-call scenario than "everything is
down," since a hasty glance at the file makes it look like the grant is already there.

No other seed idea needed to be swapped, though #2 (primary group) required deliberately engineering the
resource around a mechanism where a supplementary-group fix would provably *not* work (see below), since the
assignment specifically asked for a "genuinely distinct mechanism," not just a differently-worded version of
`user-not-in-group`.

## Verification notes worth recording

- **`user-primary-group-mismatch`**: confirmed the primary/supplementary distinction empirically, not just
  by reasoning about POSIX semantics. `/srv/exports` has no setgid bit; `dataexport` owns the directory
  (so it can always write there — that was never the bug) but its *primary* group was left as its own
  private group. With a `umask 027` (mimicking the real export job), a file `dataexport` creates is
  `rw-r-----` — group-readable, not world-readable, so group correctness is the only thing standing between
  `analyst` and the file. Tried `usermod -aG exportreaders dataexport` (the wrong, supplementary fix) first
  and reproduced the failure staying exactly as broken (`ls -l` still showed the file group-owned
  `dataexport`, `analyst` still denied) before confirming `usermod -g exportreaders dataexport` (the
  correct, primary-group fix) resolves it. Both results are written up in `solution.md`.
- **`user-duplicate-uid`**: confirmed `getent passwd <uid>` and `ls -l` genuinely only ever surface the
  *first* matching `/etc/passwd` entry for a given UID (`getpwuid()` semantics) — the only reliable
  detection is reading `/etc/passwd` directly (`awk -F: '$3==UID'` or `sort | uniq -d` across all UID
  fields). Also confirmed `usermod -u <newuid>` automatically re-chowns the account's own home directory to
  the new UID (no manual `chown` pass needed for that specific path), so `check.sh` verifies actual on-disk
  ownership consistency post-fix, not just that the two `/etc/passwd` UID fields differ.
- **`user-password-expired-chage`**: confirmed this is meaningfully testable and distinct from
  `user-account-locked` before committing to it, per the assignment's explicit caveat. `chage -d 0` sets a
  real PAM/`pam_unix`-enforced sentinel that fires even when **root** invokes `su -`, unlike a simple
  `passwd -l` lock (which root's `su` bypasses freely, and which this repo's `user-account-locked` already
  correctly avoids using for exactly that reason). Also confirmed a natural wrong-fix attempt
  (`chage -M -1` alone, disabling the max-age policy without touching the last-changed date) does **not**
  clear the block — `su` still fails identically — because the `0` sentinel on the last-changed date is
  the direct cause, not the max-days policy around it. `check.sh` and `solution.md` both hinge on this
  specific, verified mechanism rather than a generic "expired password" hand-wave.
- **`user-shell-binary-missing`**: confirmed `useradd -s <nonexistent-path>` only warns (non-fatal, exits 0)
  at account-creation time, and that `su -` against such an account fails with a distinct, unambiguous
  `exec()`-level message (`su: failed to execute ...: No such file or directory`) rather than any shell's
  own output — cleanly distinguishable in both symptom and root cause from `user-nologin-shell`'s real,
  installed, intentionally-failing `/usr/sbin/nologin`.
- **`sudoers-dropin-syntax-error`**: the first hint/solution draft suggested fixing via
  `sudo visudo -f /etc/sudoers.d/netops` (open an editor, correct the line, save) — the same style
  `sudo-missing-privilege`'s hints offer as a secondary option. Actually running it against this image
  failed: no text editor (`vi`, `nano`, `$EDITOR`) is installed, so `visudo -f` errors with
  "no editor found." Corrected both `hints.json` and `solution.md` to lead with the working alternative
  (`echo '...' | sudo tee ... && sudo chmod 440 ... && sudo visudo -c`) before considering the challenge
  done — a good reminder that a "the real fix works" hint needs to actually be run in the container, not
  assumed to work because it worked in a fuller-featured reference system.

## Verification results

All 5 went through the full build → run-with-real-flags (`--network none`, default resource limits) →
check-before (non-zero) → fix-as-`trainee` → check-after (0) loop, one at a time (not in parallel):

| Slug | Build | Check before fix | Fix as trainee | Check after fix |
|---|---|---|---|---|
| `sudoers-dropin-syntax-error` | clean | exit 1 | `tee`+`chmod`+`visudo -c` corrected drop-in (no editor installed — `visudo -f` alone doesn't work here) | exit 0 |
| `user-primary-group-mismatch` | clean | exit 1 | `sudo usermod -g exportreaders dataexport` | exit 0 (re-ran check.sh twice to confirm idempotency) |
| `user-shell-binary-missing` | clean | exit 1 | `sudo usermod -s /bin/bash reportbot` | exit 0 |
| `user-duplicate-uid` | clean | exit 1 | `sudo usermod -u 1302 metricsagent` | exit 0 |
| `user-password-expired-chage` | clean | exit 1 | `sudo chage -d $(date +%Y-%m-%d) backupsvc` | exit 0 |

All 5 `challenge.json` files were also checked for required-field completeness, `slug` pattern, `difficulty`
enum membership, `category` (`users-groups-sudo`, matched against an existing sibling challenge), and
`resource_limits` bounds against `_schema/challenge.schema.json`'s constraints (no `jsonschema` package was
available in this environment to run a literal schema validator, so this was a manual field-by-field check
against the schema file's own rules).

**Real-stack verification** (2 of 5, per the assignment's minimum): the dev-override `docker compose` stack
was not running at the start of this batch; brought up via `docker compose up -d`, then
`docker compose restart backend` to force `syncChallengesFromDisk` to pick up all 5 new directories (backend
logs confirmed all 5 new slugs synced, alongside the full existing catalog). A throwaway account
(`verify-usersudo-batch@example.com`) was signed up via the real `POST /api/auth/signup`. Two real sessions
were driven end-to-end through the actual HTTP API (`POST /api/challenges/:slug/sessions`, `POST
/api/sessions/:id/check`, `POST /api/sessions/:id/stop`), with the fix applied via `docker exec -u trainee`
into the real spawned session container:

- `sudoers-dropin-syntax-error`: API check returned `{"passed":false}` before the fix, `{"passed":true}`
  after.
- `user-duplicate-uid`: same pattern, `{"passed":false}` → `{"passed":true}`.

Both sessions' containers were confirmed removed after `/stop`. The throwaway account was deleted via the
real `DELETE /api/auth/me` afterward.

## Cleanup

Local `verify/*` test images and containers built during the per-challenge build→break→fix loop were all
removed after each challenge passed (`docker rmi verify/sudoers-dropin-syntax-error
verify/user-primary-group-mismatch verify/user-shell-binary-missing verify/user-duplicate-uid
verify/user-password-expired-chage`). The two lazily-built real platform images
(`devops-trainer/sudoers-dropin-syntax-error:1`, `devops-trainer/user-duplicate-uid:1`) created by the
backend during real-API verification were left in place — that's the intended, cached-build behavior
(decision 0004), not test residue. Several other `verify/*` images (cron-, disk-, perm-, pkg-, logs-
prefixed) were observed already present in the local Docker image cache, left over from other agents
working on different category batches concurrently; these were not touched, per scope. The throwaway
account and both of its real session containers were removed via the real API by the end of this batch. The
dev-override `docker compose` stack (`postgres`, `backend`, `frontend`) was left running, per instructions.
