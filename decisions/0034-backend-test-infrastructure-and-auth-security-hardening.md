# 0034 — Backend test infrastructure (vitest) + auth security hardening

## Context

This project had zero automated tests from Phase 0 onward — every verification pass to date was a
manual curl/psql script, repeated by hand each time. `CLAUDE.md` already anticipated test tooling
as expected future work ("there is no lint, format, or test tooling configured yet in either
package — don't assume `npm test`/`npm run lint` exist until they're added"), so this pass adds it,
alongside a focused security review of the auth surface added in decisions/0029.

## Test infrastructure

**Choice: vitest**, added as a `backend` devDependency (`^3.0.0`, resolved to `3.2.7`). This is a
dev-only addition — the project's "no new runtime dependencies" discipline has always been about
production/runtime code (hand-built UI, hand-rolled auth, no ORM, etc.), not test tooling, which
`CLAUDE.md` already called out as intentionally deferred rather than prohibited. vitest was picked
over `node --test` for its fake-timer support (needed for the rate-limiter tests) and over Jest for
native ESM/TS support with no extra transform config, matching this backend's `"type": "module"` +
`NodeNext` setup with zero extra config.

Scripts added to `backend/package.json`:
- `test` → `vitest run test/unit` (no DB, no Docker — safe to run anywhere, including CI)
- `test:watch` → `vitest` (interactive)
- `test:integration` → `vitest run test/integration` (needs a real reachable Postgres — see below)

### Unit vs. integration split, and why

`backend/test/unit/`, run with `npm test`, covers:
- **`rateLimit.ts`'s `rateLimit()` factory** (`test/unit/rateLimit.test.ts`) — pure in-memory
  fixed-window logic, zero I/O. Covers: allows up to `max` within the window, blocks `max+1`,
  keeps blocking within the same window, resets after the window elapses (vitest fake timers),
  and that different `keyFn` keys are tracked independently.
- **`auth.service.ts`'s pure functions** (`test/unit/auth.service.test.ts`): `hashPassword` /
  `verifyPassword` (bcrypt round-trip + salting), `hashResetToken` (deterministic sha256 — this
  function was `export`ed for the first time specifically so it could be unit-tested directly,
  a behavior-preserving visibility change), and `signAuthToken`/`verifyAuthToken` (signature,
  expiry, token-type checks, and the new password-change-invalidation check below). Because the
  security fix below makes `verifyAuthToken` genuinely need a DB read (it wasn't pure before
  either, in the sense that it will now do I/O), its unit tests mock `../db/pool.js`'s `.query` so
  they stay fast/isolated while still exercising the real production code path end-to-end except
  for that one I/O boundary.
- **`docker.service.ts`'s pure helpers** (`test/unit/docker.service.test.ts`): `imageTag` (tag
  format, including on `content_version` bump) and `isNotModifiedOrMissing` (both `export`ed for
  the first time, same reasoning as `hashResetToken`). Writing this test caught a real latent bug
  — see "Bug found" below.

`backend/test/integration/` (`auth.integration.test.ts`), run with `npm run test:integration`,
hits the **real** Postgres this repo's `docker-compose` stack already runs, covering
`signup`/`login`/`changePassword`/`resetPasswordWithToken`/`getUserById` — the functions that
can't be meaningfully tested without a real DB round trip. This repo's `docker-compose.yml`
deliberately does not expose Postgres on a host port (`internal`-only network — the topology
description in the root `CLAUDE.md` calls this out explicitly), so these tests can't run from a
bare host shell; they run **inside the backend container**, where `DATABASE_URL` already resolves
via the `internal` Docker network:
```
docker compose exec backend npm run test:integration
```
`docker-compose.override.yml` (dev-only) now also bind-mounts `./backend/test` and
`./backend/vitest.config.ts` into the container alongside the existing `src`/`package.json`/
`tsconfig.json` mounts, specifically so these test files are visible inside it without a rebuild
on every edit. Every row the integration suite creates is deleted in an `afterEach`/`afterAll`
(same "clean up after every verification pass" discipline as every prior manual pass on this
project), and a run against the live stack confirmed zero leftover rows afterward.

Real output, `cd backend`:
```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 ✓ test/unit/rateLimit.test.ts (5 tests)
 ✓ test/unit/docker.service.test.ts (6 tests)
 ✓ test/unit/auth.service.test.ts (12 tests)
 Test Files  3 passed (3)
      Tests  23 passed (23)

$ docker compose exec backend npm run test:integration
 ✓ test/integration/auth.integration.test.ts (6 tests) 2922ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Bug found while writing tests

`docker.service.ts`'s `isNotModifiedOrMissing(err)` destructured `(err as {...}).statusCode`
without checking `err` for `null`/non-object first — passing `null` (or any primitive) threw a
`TypeError` instead of returning `false`. Its only caller, `destroyContainer`'s `catch` block,
would then throw that unrelated `TypeError` instead of the container-removal error it was actually
trying to classify, on the (unlikely but real) path where a rejection carries a non-object value.
Fixed with a type guard; a dedicated test (`is false when there is no statusCode at all`) now
covers `null`, a bare `{}`, and a plain `Error`.

## Security review: auth surface (decisions/0029)

### 1. Password change/reset did not invalidate already-issued JWTs — confirmed real, fixed

Auth tokens are stateless JWTs (`jsonwebtoken`, `signAuthToken`) with a fixed 7-day expiry and no
server-side revocation list. Confirmed by reading `signAuthToken`/`verifyAuthToken` before any
change: `verifyAuthToken` only checked the signature, expiry, and a `type` claim — nothing tied to
account state. So a user who called `/api/auth/change-password` because they suspected their token
had leaked got **no actual security benefit** from that action: a stolen token kept working,
unchanged, until its own natural 7-day expiry. Same gap existed for the forgot-password reset
flow, which is if anything the more likely path someone takes *specifically because* they suspect
compromise.

**Fix implemented** (smallest reasonable shape, as the prompt's own suggestion outlined):
- Migration `backend/migrations/0005_password_changed_at.sql`: `ALTER TABLE users ADD COLUMN
  password_changed_at TIMESTAMPTZ` (nullable; `NULL` means "never changed since signup" — every
  token accepted on signature/expiry alone, i.e. unchanged behavior for an account that's never
  changed its password).
- `auth.service.ts`'s `changePassword` and `resetPasswordWithToken` now set
  `password_changed_at = now()` in the same `UPDATE` statement that changes `password_hash` (no
  separate round trip, no window where one could succeed without the other).
- `verifyAuthToken` became `async` and now does one extra `SELECT password_changed_at FROM users
  WHERE id = $1` per call, comparing it against the JWT's own `iat` (issued-at, seconds since
  epoch — set automatically by `jsonwebtoken` at sign time, not something `signAuthToken` had to
  change). A token with `iat` before `password_changed_at` is rejected with "token issued before
  most recent password change", even though it's still cryptographically valid and unexpired.
- `requireAuth.ts` updated to `await` the now-async `verifyAuthToken` (its own `try/catch` already
  handles rejection correctly — no route/caller changes needed beyond this one middleware).

**Tradeoff being made explicitly, not silently**: `verifyAuthToken` now does a DB read on every
authenticated request, where before it was fully in-process. For a single-node personal tool this
is negligible (a PK lookup against a tiny `users` table), and it's the same tradeoff this project
already made in `session.service.ts`/`docker.service.ts` throughout — correctness and simplicity
over shaving a query. Flagging it here in case a future high-throughput deployment ever needs to
reconsider (e.g. caching `password_changed_at` in the JWT payload itself and only re-checking it
periodically — deliberately not done here since it reintroduces a staleness window on the exact
property this fix exists to close).

**Functional verification against the real running stack** (`docker compose up --build -d` after
adding the migration; confirmed `schema_migrations` includes `0005_password_changed_at.sql` and
`\d users` shows the new column):
```
signup                                    -> token A, GET /api/auth/me with token A -> 200
POST /api/auth/change-password             -> {"ok":true}
GET /api/auth/me with STALE token A        -> 401  (this is the fix actually taking effect)
login with new password                    -> token B
GET /api/auth/me with fresh token B        -> 200
DELETE /api/auth/me (cleanup)              -> {"ok":true}
GET /api/auth/me with token B post-delete  -> 401
```
Also re-verified end-to-end with a second throwaway account that only did
signup → display-name update → delete, and a forgot-password call against a nonexistent address —
both unaffected by this change, confirming the new check doesn't break the normal flows. All
throwaway accounts confirmed deleted from `users` afterward (`count = 0`).
Automated coverage: `test/unit/auth.service.test.ts` (mocked-DB unit tests, both branches) and
`test/integration/auth.integration.test.ts` (real DB, both the `changePassword` and
`resetPasswordWithToken` variants of the exact same before/after-invalidation property).

### 2. Account-deletion mid-session race — traced, found a real (different) gap, fixed

Traced `deleteOwnAccount` (`auth.service.ts`) end to end before touching anything:
1. Verify current password (unchanged).
2. `getActiveSessionForUser(userId)` — reads the live `sessions` row, if any.
3. If found, `stopSession(activeSession.id, userId, "abandoned")` — reuses the existing
   session-lifecycle teardown path (not reimplemented): this destroys the actual Docker container
   via `destroyContainer` (force-remove) and then updates the session row's status.
4. `DELETE FROM users WHERE id = $1` — cascades to `sessions` (`ON DELETE CASCADE user_id`), which
   cascades further to `check_attempts` (`ON DELETE CASCADE session_id`).

**The ordering itself was already correct** — container teardown genuinely happens *before* the
row that references it is deleted, not concurrently with it and not after. So the literal
"orphaned container with no matching session row" race the prompt described does not exist in the
happy path.

**What was actually wrong**: step 3's call was wrapped in `.catch(() => {})`. If `destroyContainer`
ever threw (Docker daemon hiccup, container already gone in a way that isn't the recognized
304/404 case, etc.), that failure was silently swallowed and **step 4 ran anyway** — deleting the
user, cascading away the only DB row that pointed at that container, while the container itself
might still be running. That reintroduces the exact orphan condition, just via a different
mechanism (error-swallowing, not ordering) and only on the less-common failure path. It's the same
class of container as the one `reconcileOrphans`/boot-time reconciliation exists to clean up — but
that only runs at backend startup, so on a personal tool that stays up for days, such an orphan
could sit consuming resources indefinitely.

Secondary, related bug in the same code path: `auth.routes.ts`'s `DELETE /me` handler caught
*every* error from `deleteOwnAccount` — including this container-teardown failure — and always
reported `"current password is incorrect"`. A user hitting this would be told their (correct)
password was wrong and would retype it, never getting anywhere, instead of learning the real
account-deletion attempt had failed and should be retried.

**Fix**: removed the `.catch(() => {})` around `stopSession` in `deleteOwnAccount` (a teardown
failure now aborts the whole deletion — account, session, and container all stay mutually
consistent, and the caller gets a real error to retry). In the route, only `"current password is
incorrect"`/`"user not found"` map to the existing generic 400; anything else (i.e. teardown
failure) now returns 500 `"failed to delete account, please try again"` and is logged via
`logger.error`, instead of being silently folded into the wrong-password message.

**Functionally verified against the real running stack**: signed up a throwaway account, started
a real session against the already-image-cached `disk-full-var-log` challenge, confirmed via
`docker ps` the session container was `Up`, called `DELETE /api/auth/me` while it was live, and
confirmed via `docker ps -a` afterward that the container is gone entirely (not just stopped —
force-removed, same as the normal `stopSession` path) and the `users` row is gone. No orphan
container, no error path exercised in this particular run (Docker was healthy throughout), but the
code path that previously could have silently swallowed a real failure is now closed.

### 3. Rate limit tuning — reviewed, no changes made

Current values (`auth.routes.ts`, all per 15-minute window unless overridden via env):
login 10 (keyed IP+email), signup 5 (IP), change-password 5 (per-user), forgot-password 5 (keyed
IP+email), reset-password 10 (IP), delete-account 5 (per-user). For a single-user/small-household
personal tool (this project's stated scope), these are reasonable: tight enough to meaningfully
slow credential stuffing/brute force (5–10 attempts per 15 minutes is not a usable guessing budget
against bcrypt-hashed passwords), loose enough that a legitimate user fat-fingering a password a
few times, or retrying a reset link, won't get locked out of their own single-user instance. All
are already tunable via env vars for anyone who wants to change them. No change made — nothing
found clearly wrong in either direction.

### 4. Other findings (reported, not separately fixed beyond what's covered above)

- The new DB read inside `verifyAuthToken` (see finding 1) is the one deliberate, called-out
  tradeoff of this pass — not a bug, but worth remembering it's there before any future
  performance-sensitive change to the auth path.
- `isNotModifiedOrMissing`'s null-crash (see "Bug found" above) was in `docker.service.ts`, not the
  auth surface proper, but was found and fixed in the same pass since it surfaced while building
  the requested docker.service.ts unit tests.

## Verification summary

- `cd backend && npx tsc --noEmit` — clean.
- `npm test` — 23/23 unit tests pass (rate limiter, auth pure functions incl. the new
  invalidation logic with a mocked DB boundary, docker.service pure helpers).
- `docker compose exec backend npm run test:integration` — 6/6 integration tests pass against the
  real Postgres container, including both the `changePassword` and `resetPasswordWithToken`
  before/after-invalidation properties.
- `docker compose up --build -d` — all three services healthy afterward;
  `schema_migrations` confirms `0005_password_changed_at.sql` applied;
  `\d users` confirms the new nullable column.
- Manual curl-based functional verification against the live stack for: token invalidation on
  password change (confirmed: pre-change token rejected, post-login token accepted), normal
  signup/login/display-name/forgot-password/delete-account flows (all unaffected), and the
  account-deletion mid-session case (confirmed: live container force-removed, user row gone, no
  orphan).
- All throwaway accounts/sessions/containers created during this pass were deleted/removed; a
  post-hoc count of `users`/`sessions` rows and `docker ps -a` for `app=devops-trainer` confirmed
  nothing was left behind beyond this project's pre-existing real data.
- Dev-override stack left running as the steady state.
