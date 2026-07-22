# 0011 — Phase 5 hardening choices (logging, rate limiting, graceful shutdown)

## Decision
Phase 5 operability hardening was kept deliberately simple and single-node, matching a personal local tool:

1. **Structured logging** — a dependency-free leveled logger (`lib/logger.ts`): timestamped
   `LEVEL message {context}` lines, `LOG_LEVEL` env (default `info`). All ad-hoc `console.*` in services,
   jobs, the WS bridge, migrations, and the error handler were replaced with it. No log-shipping/observability
   stack — out of scope.

2. **Auth rate limiting** — a tiny in-memory fixed-window limiter (`middleware/rateLimit.ts`) on
   `POST /api/auth/login` (keyed per IP+email so one hammered account can't lock out others behind the same
   IP/proxy) and `/api/auth/signup` (keyed per IP). Tunable via `AUTH_LOGIN_MAX`, `AUTH_SIGNUP_MAX`,
   `AUTH_RATE_WINDOW_MS`. Explicitly **not** distributed (no Redis) — a single-node personal tool doesn't need
   it, per the stated constraints. Express `trust proxy` is enabled so the real client IP is used behind the
   frontend nginx.

3. **Graceful shutdown** — on `SIGTERM`/`SIGINT` the backend stops the reaper, closes all terminal WebSockets,
   stops accepting connections, then `drainAllActiveSessions()` destroys every active session's container and
   marks it `abandoned`, and closes the DB pool, with a 20s hard-deadline fallback.

## Why these, and the dev-mode caveat
The concurrency cap and one-session-per-user were already implemented in Phase 2's `session.service.ts`; Phase 5
added tests, not new code, for those (verified: 3 allowed then 429; starting a second session tears down the
first). Orphan reconciliation and the idle reaper likewise existed; they were verified by *actually* crashing
the backend (`kill -KILL`) mid-session and confirming the next boot removes orphans and marks dead-container
sessions `error`, and by driving the reaper with a 0-minute idle timeout.

The one sharp edge worth recording: **graceful shutdown does not drain in dev mode.** The dev override uses
`tsx watch` for hot reload, which runs the app in a child process and hard-kills it on `SIGTERM` without
awaiting its handler (running it via `npm`, `npx`, or `node_modules/.bin/tsx` all leave the watcher, not the
app, owning the signal). Rather than sacrifice hot reload, we accept this: the graceful drain is implemented
and **verified against the production image** (node as PID 1, no watcher), which is what a real deployment runs;
and the boot-time reconciliation is the guaranteed safety net for the dev cycle (`compose down` then `up`
removes any leftover challenge containers). This is documented in the compose override and the README.

## How to apply
Reuse `logger` instead of `console.*`. If adding another abuse-prone endpoint, reuse `rateLimit()` with an
appropriate `keyFn`. Any new background loop should be cleared in the `shutdown()` handler in `index.ts`, and
any new source of challenge containers must be covered by `drainAllActiveSessions()` and boot reconciliation.
