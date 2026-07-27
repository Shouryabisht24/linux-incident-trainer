# 0028 — Terminal reliability pass: exec registry, mirrored terminals, and frontend auto-reconnect

## Decision

`docker.service.ts` gains an in-memory `execRegistry: Map<containerId, TerminalSession>` and three functions
(`attachOrCreateShell`, `releaseSocket`, `endShellSession`) that own the lifetime of a container's interactive
`bash -l` exec independently of any one WebSocket connection. `terminalSocket.ts`'s `bridge()` now attaches to
that registry instead of calling `execShell()` directly on every connection. The frontend (`TerminalPane.tsx`)
splits its single mount+socket effect into a mount-once effect (Terminal/FitAddon/ResizeObserver, never torn
down by a reconnect) and a socket-only effect (WebSocket, torn down and recreated per ticket), and
`ChallengeDetailPage.tsx` gets a bounded exponential-backoff auto-reconnect state machine.

## Why

Before this pass, every WebSocket connection — including a reconnect after a few seconds of network blip —
called `execShell(containerId)` fresh, spinning up a brand-new `bash -l` process. The container itself never
stopped running, but the user's cwd, exported env vars, and shell history were destroyed on every reconnect
regardless. For a tool whose entire premise is "practice a real incident in a real shell," losing your working
state to an ordinary Wi-Fi hiccup was the single biggest reliability gap in the core feature.

**Keyed by `containerId`, not by session ID or WebSocket connection.** Every existing container-teardown path —
`stopSession`, both `reapIdleSessions` branches (idle timeout and post-solve grace), `drainAllActiveSessions`
(graceful shutdown drain), `reconcileOrphans` (boot-time orphan cleanup) — already funnels through
`destroyContainer(containerId)`, five call sites, all already holding a `containerId`. Hooking exec cleanup into
`destroyContainer` itself (as its literal first line, calling the new `endShellSession(containerId)`) means all
five call sites get correct exec cleanup for free, with zero changes to any of them. Keying by session ID or
socket would have required threading a new identifier through call sites that don't currently carry one.

**Mirrored terminal for concurrent connections, not last-writer-wins.** If a user opens the same session in two
tabs, or an auto-reconnect attempt lands while the old (about-to-die) connection is still technically open, both
WebSockets simply attach to the same `sockets: Set<WebSocket>` on the same `TerminalSession` and both see the same
live output; either can type; input interleaves. This matches real shared-PTY semantics (two `tmux` clients
attached to one session) and needs no new protocol — no "who owns this session" negotiation, no risk of the
handoff logic accidentally killing a legitimate new connection while trying to preempt a stale old one. Security
is unchanged: `getSessionForUser(sessionId, userId)` (already called in `bridge()`) still gates every connection
attempt by ticket ownership, so this only ever mirrors a user's own connections to their own session, never
across users.

**Numeric choices:**
- **120s reconnect grace period** (`RECONNECT_GRACE_MS`, `docker.service.ts`) — once the last socket detaches,
  the exec is kept alive for 2 minutes before `stream.end()`. Long enough to cover a real Wi-Fi drop, a laptop
  lid close/reopen, or a flaky mobile connection's several retry cycles, without keeping a `bash -l` process (and
  its container-side resources) alive indefinitely for a user who's actually done and just closed the tab.
- **30s ping interval** (`PING_INTERVAL_MS`, `terminalSocket.ts`) — standard `ws` heartbeat cadence; a dead peer
  (laptop slept without a clean TCP close) is detected and `terminate()`d within one missed cycle (up to ~60s
  worst case: one full interval to notice `isAlive === false`, having already flipped it false at the start of
  the previous sweep). Verified live: a healthy idle connection received exactly 3 pings at ~30.0s spacing over a
  90+ second idle window and remained fully responsive throughout — the heartbeat doesn't spuriously kill a
  healthy session.
- **4 MiB backpressure pause / 1 MiB resume** (`docker.service.ts`) — the dockerode exec stream is paused once
  any attached socket's `bufferedAmount` exceeds 4 MiB (a slow/paused client falling behind), and resumed only
  once *all* attached sockets have drained below 1 MiB. The gap between the two thresholds is deliberate
  hysteresis — pausing and resuming at the same threshold would thrash the stream on/off every time a burst
  landed near the line. Verified live: a client paused its own socket read entirely for ~15s while
  `yes | head -c 50000000` (75MB after LF→CRLF pty translation) ran server-side; the backend container's RSS
  stayed flat in a ~68-76 MiB band for the whole window rather than growing with the total output size, then the
  full 75,000,228 bytes were delivered once the client resumed reading.
- **5-attempt / ~23s reconnect budget** (`RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000]`,
  `ChallengeDetailPage.tsx`) — covers the same class of transient drop the 120s exec grace period is designed for,
  capped well under it so the frontend gives up on auto-reconnect (falling back to the existing manual "Reconnect"
  button + toast) while the backend is still very much willing to resume the shell if the user does hit that
  button. Capped at 8s between attempts rather than continuing to back off further, since past ~15-20s of total
  silence the existing manual-reconnect UX is a better signal to the user than an invisible retry loop.
- **10,000-line scrollback** (`Terminal` constructor, `TerminalPane.tsx`) — xterm's own default is 1,000, which
  was already tight for a real troubleshooting session (verbose `journalctl`, `dmesg`, package manager output).
  Now that a reconnect actually preserves this buffer (see below) rather than recreating the terminal from
  scratch, a larger buffer's value compounds across a session instead of being thrown away on every drop.

## How this fixes the frontend half

Splitting `TerminalPane.tsx`'s effect was necessary, not cosmetic: the old single `[wsTicket]`-keyed effect
disposed and recreated the `Terminal` object itself on every reconnect, which would have thrown away scrollback
and the on-screen buffer even after the backend started offering real continuity to resume into. The mount-once
effect (`[]` deps) now owns `Terminal`/`FitAddon`/`ResizeObserver` for the component's whole lifetime; the
socket-only effect (`[wsTicket]` deps) owns only the `WebSocket` and reads the terminal via a ref. The
`ChallengeDetailPage.tsx` backoff state machine never fights the existing `stoppingRef` stop-suppression
mechanism — it checks `stoppingRef.current` both before scheduling a retry and again inside the retry's
`setTimeout` callback (a stop can land mid-backoff), and clears any pending timer on slug change and on stop,
mirroring exactly where `stoppingRef`/`stoppedSessionIdsRef` already get reset.

## Verified

Against the real stack (both `docker compose up --build -d` dev-override on `:4000`/`:5173`, and
`docker compose -f docker-compose.yml up --build -d` production nginx path on `:3000`), driving the real
`/ws/terminal` WebSocket protocol directly with a small Node `ws` client (no headless browser available in this
environment — see below):

- **Shell-state survival (both transport paths)**: signed up a throwaway account, started a real session
  (`perm-config-unreadable-by-app` / `perm-executable-bit-missing`), ran `cd /tmp && export FOO=bar && echo
  hello-before-drop`, then `ws.terminate()`'d the connection (a real abrupt TCP-level drop — no close frame sent,
  confirmed server-side close code `1006`, not the `1000` a clean `ws.close()` would produce). Reconnected via a
  freshly issued ws-ticket (the same `POST /:id/ws-ticket` + reconnect flow the app itself uses) under the 120s
  grace window. `pwd` → `/tmp`, `echo $FOO` → `bar`, `history` → the earlier command, and the
  `[reconnected — shell session resumed]` banner all confirmed on both `:4000` (direct) and `:3000` (nginx-proxied)
  paths.
- **Backpressure**: see numeric choices above — real measured plateau, not just code inspection.
- **Ping/pong**: 3 pings received at ~30.0s spacing across a 90s idle-but-connected window; connection remained
  responsive to a real command afterward. No spurious termination of a healthy session.
- **Idle reaper regression check**: artificially aged a live session's `last_activity_at` by 25 minutes via
  direct SQL, confirmed the next 30s reaper tick logged `reaping idle session`, destroyed the container (gone
  from `docker ps -a --filter label=app=devops-trainer`), and marked the session `expired` — exercising
  `destroyContainer`'s new `endShellSession` first line with no crash.
  Also verified `reapIdleSessions`'s prior code path (idle timeout also being backend `execShell`) unchanged
  otherwise for this challenge type.
- **Graceful shutdown regression check**: on the production image (`node dist/index.js`, not `tsx watch`, so
  `SIGTERM` reaches the app rather than being hard-killed by a file watcher), `docker compose restart backend`
  with one active session logged `shutdown initiated` → `http server closed` → `drained active sessions
  {"count":1}` → `shutdown complete` in 50ms, well under the 20s hard deadline; the session's container was
  destroyed cleanly (session marked `abandoned`, no orphan left in `docker ps -a`). Confirmed separately that the
  dev-override stack's own boot-time orphan reconciliation still runs cleanly across a restart there too (per its
  pre-existing documented caveat that `tsx`'s watcher hard-kills on `SIGTERM` in dev, so the graceful drain itself
  is only meaningfully exercised on the production image — unchanged by this pass).
- **Frontend auto-reconnect state machine, toast fallback, and stop-suppression**: verified by careful code
  reading only — **no headless browser is available in this environment** (same standing limitation noted in
  prior passes, e.g. the 2026-07-26 challenge-detail polish entry in `tasks.md`), so the exact backoff timing,
  the "Terminal connection lost" toast firing only after 5 exhausted attempts, and "Stop Session" producing zero
  reconnect attempts could not be exercised against a real running browser session in this pass. The backend
  half of every one of these interactions (the actual WS reconnect, ticket issuance, and shell resumption they
  depend on) *was* verified live per above.
- Cleaned up every throwaway account, session, and container created during verification; left the dev-override
  stack running as the steady state afterward.
