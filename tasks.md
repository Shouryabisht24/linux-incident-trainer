# Tasks — DevOps Troubleshooting Trainer

Tracks work across the phased build order in the implementation plan. Check items off as they land; add new items under the relevant phase as they're discovered. See `decisions/` for the reasoning behind non-obvious choices.

## Phase 0 — Scaffolding
- [x] Repo directory skeleton (`frontend/`, `backend/`, `challenges/`, `decisions/`)
- [x] `tasks.md` created
- [x] `decisions/` created with initial architecture decisions recorded
- [x] Install vetted skills (vercel-react-best-practices, supabase-postgres-best-practices, multi-stage-dockerfile, docker-compose-orchestration)
- [x] `docker-compose.yml` + `docker-compose.override.yml` + `.env.example`
- [x] `backend/Dockerfile` (multi-stage) + minimal Express app with `GET /health`
- [x] `frontend/Dockerfile` (multi-stage, nginx) + minimal Vite React app with a health/landing page
- [x] `README.md` with local setup instructions + explicit security notes (docker.sock exposure, local-only)
- [x] Verify: `docker compose up` brings up all three services; backend and frontend health endpoints respond
      (verified both the dev override path — vite on :5173 — and the production nginx path on :3000; fixed two
      real bugs found during verification: nginx crashed on boot resolving the `backend` upstream before it was
      ready, fixed with a lazy `resolver`+variable `proxy_pass`; the `devops-trainer-challenges` network was
      silently dropped by Compose since no service attached to it, so it's removed from compose.yml with a note
      that `docker.service.ts` must create it via dockerode in Phase 2 instead)

## Phase 1 — Auth + DB
- [x] Migration tooling: plain numbered SQL files (`backend/migrations/`) + a small runner (`db/migrate.ts`) that
      tracks applied migrations in `schema_migrations` and runs automatically at backend boot — not node-pg-migrate,
      simpler for a single-developer project. First migration covers all 7 tables.
- [x] Seed script for the 10 fixed categories (`challenge.service.ts` `seedCategories()`, runs at boot; also
      exposed via `backend/scripts/seed-challenges.ts` for manual re-seeding, dev-only, not in the prod image)
- [x] `auth.service.ts` (bcryptjs + JWT) + `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- [x] `requireAuth` middleware
- [x] Minimal `AuthForm` (login/signup toggle) + `AuthContext` — no separate router/pages yet, kept to plain
      component state since Phase 2's job is proving the concept end-to-end, not UI polish (that's Phase 3)

## Phase 2 — Challenge framework + first working end-to-end challenge
- [x] `challenges/_schema/challenge.schema.json` + `challenge.service.ts` loader (`syncChallengesFromDisk`)
- [x] `docker.service.ts` (dockerode build/create/exec/destroy, network ensure, orphan reconciliation)
- [x] Reference challenge: `challenges/perm-config-blocks-service/` fully implemented — **redesigned mid-build**
      after live testing showed the original break (chmod 000 on nginx.conf) didn't work: nginx's master process
      runs as root and ignores file permissions entirely, so `sudo service nginx start` succeeded regardless. Fixed
      by breaking `/var/www/html` permissions instead — nginx's *worker* process drops to `www-data` (unprivileged)
      to actually serve files, so that permission barrier is real. See `decisions/0007-*.md`.
- [x] Sessions API (start, heartbeat, check, stop, hints, solution) + added `POST /api/sessions/:id/ws-ticket`
      (not in the original plan) to reissue a terminal ticket for an already-running session — needed once it
      became clear tickets expire in 60s and there was no way to reconnect (e.g. after a page refresh) without it.
- [x] WS terminal bridge (`ws/terminalSocket.ts`) + `TerminalPane` component (`@xterm/xterm` + `@xterm/addon-fit`)
- [x] Early systemd-in-Docker smoke test — done in Phase 4: real systemd-in-Docker confirmed working on the
      target (Docker 29.x / Docker Desktop): `systemctl is-system-running` = running, services start, journalctl
      works. Real systemd chosen over the supervisor fallback; `createSessionContainer` gained a `requires_systemd`
      branch (SYS_ADMIN + cgroup mount + tmpfs /run). See `decisions/0010-*.md`.
- [x] Manual verification: start → shell (confirmed running as non-root `trainee` with working passwordless sudo)
      → see break (403, confirmed via `ls`/`curl` inside the container) → fix live via the actual WS terminal bridge
      → check passes → progress/solved state updates → container torn down on stop. Driven via curl + a small
      Node WS test client (no real browser available in this environment) — open http://localhost:5173 to try it
      in an actual browser.

## Phase 3 — Frontend polish
- [x] `ChallengeListPage` with category/difficulty/solved filters (`frontend/src/pages/ChallengeListPage.tsx`)
- [x] `ProgressDashboardPage` (`frontend/src/pages/ProgressDashboardPage.tsx`) — backed by an extended
      `GET /api/progress` (now returns a per-category `categories[]` breakdown alongside the existing
      total/solved counts; additive, see `decisions/0008-*.md`)
- [x] Markdown rendering for descriptions/solutions (`react-markdown` + `remark-gfm` via `components/Markdown.tsx`,
      used on both the challenge description and the revealed solution)
- [x] react-query integration for server state (`@tanstack/react-query`; all server reads/writes go through
      `frontend/src/api/queries.ts` — challenges, challenge detail, categories, progress, active session, hints,
      and mutations for start/stop/check/reveal-hint/solution/ws-ticket-refresh, with cache invalidation wired so
      a passed check updates the list/dashboard's solved state without a manual refetch)
- [x] Loading/error states throughout (every async action has a visible pending state — spinner + disabled button —
      and a visible failure state via toast; `PageLoading`/`ErrorBanner` for query-level loading/error)
- [x] Resume an existing running session on mount/refresh — added `GET /api/sessions/active` (new, additive; see
      `decisions/0008-*.md`) so `ChallengeDetailPage` can detect a running session on mount, fetch a fresh
      `ws-ticket` via the existing `POST /api/sessions/:id/ws-ticket`, and reconnect the terminal automatically.
      Verified against the real backend: started a session via curl, waited past the 60s ticket expiry, called
      `/api/sessions/active` then `/ws-ticket`, and drove the reissued ticket through a raw WS client (`ws` pkg) —
      connected, resized, sent a command, got the echoed output back.
- [x] Proper page routing (`react-router-dom`; `/login`, `/challenges`, `/challenges/:slug`, `/progress`, all
      client routes verified to survive a hard refresh both via the Vite dev server and the built app served by
      nginx — `try_files $uri /index.html` already handled the SPA fallback, no nginx config change needed).
      `ChallengeDetailPage`/`ChallengeListPage`/`ProgressDashboardPage` are route-level code-split with
      `React.lazy` since `ChallengeDetailPage` pulls in `xterm.js`, which pushed the single-bundle build past
      Vite's 500kB warning threshold.
- [x] **Follow-up pass (post-Phase 6)**: upgraded the login/signup form (`components/AuthForm.tsx`) to match the
      landing page's visual quality instead of the bare `.page-narrow` + `.card` treatment it had — new `.auth-*`
      styles in `styles.css` extend the same tokens as the landing page (hero-style radial gradient background,
      glass/backdrop-blur card, `.eyebrow` pill), a segmented login/signup toggle with a sliding indicator instead
      of a plain ghost-button switch, a CSS grid-rows collapse animation for the signup-only display-name field,
      a gated mount animation (only applied when `useReducedMotion()` is false — the existing global
      `prefers-reduced-motion` CSS block still neutralizes it either way), and inline real-time email-format/
      password-length validation on blur (not just native `required`/`minLength` tooltips), with
      `aria-invalid`/`aria-describedby` wired to the error text. `?mode=signup`, the optional display name field,
      error display, and the submitting/disabled button state are all unchanged.
      Also added, same pass: **spaces are rejected outright in the email and password fields** — a `useNoSpaceField`
      hook blocks the spacebar on `keydown`, strips whitespace from pasted text on `paste` (rather than blocking
      the whole paste) while preserving caret position, and re-strips on `change` as a backstop for other input
      paths (autofill, drag-drop). Same rule added server-side in `backend/src/routes/auth.routes.ts` (additive,
      next to the existing type/length checks, rate limiting untouched): both `/signup` and `/login` now 400 with
      `"email and password must not contain whitespace"` if either field matches `/\s/` (space, tab, or newline).
      Verified: `npx tsc --noEmit` and `npm run build` clean on the frontend, `npx tsc --noEmit` clean on the
      backend; rebuilt and booted the real stack (`docker compose up --build -d`) and curled the live backend
      directly — normal signup/login with clean credentials succeed (201/200), and signup/login with a space or a
      tab in either the email or the password field are rejected with 400. Confirmed via the Vite dev server
      (`:5173`, the steady-state dev-override stack) that the served `AuthForm` bundle wires `onKeyDown`/`onPaste`/
      `onChange` exactly as written. No headless-browser tool was available in this environment to literally
      keystroke a space in a live page, so the keydown/paste-strip logic itself was additionally isolated and
      unit-sanity-checked outside the app (space key blocked, mixed whitespace stripped from pasted text, email
      regex behaves) rather than only reviewed by eye.
- [x] **Follow-up pass (post-Phase 6, after the login-page pass above)**: upgraded `ChallengeListPage.tsx` from a
      plain native-`<select>` filter bar + bare grid to match the landing/login pages' visual quality. Replaced
      the difficulty and solved-status `<select>`s with a real ARIA `radiogroup` segmented "chip" control
      (`ChipGroup`, roving tabindex — Tab lands on the checked option, Left/Right/Up/Down/Home/End move selection
      *and* focus together, same pattern native radio groups use) since those only have 3–4 fixed options; kept
      the category filter as a native `<select>` (10 options) but restyled it (`appearance: none` + custom
      chevron icon) rather than replacing it with a custom listbox — deliberate call, since a from-scratch
      combobox risked a keyboard/screen-reader regression I had no headless browser available to verify
      interactively (same constraint noted in the AuthForm pass above), whereas a styled native `<select>` keeps
      100% of its native keyboard/typeahead/SR behavior for free. Added a title-text search input (`<input
      type="search">`, plain client-side substring filter, no new endpoint). Restyled cards with a hover
      lift+glow, a solved state that's a green-tinted background + border + an absolute-positioned "Solved" pill
      (SVG check icon, no emoji — consistent with the landing page's "no emoji" icon convention) instead of the
      old prepended checkmark emoji. Added a real empty state (`EmptyState`, dashed-border card + icon + a
      "Clear filters" button wired to the same `clearFilters` used by the toolbar's own clear button) replacing
      the bare `<div>No challenges match these filters.</div>`. Added a skeleton-card loading grid
      (`SkeletonGrid`, shape-matched to the real grid, shimmer animation) in place of the generic `PageLoading`
      spinner used elsewhere — a deliberate divergence from the `ChallengeDetailPage`/`ProgressDashboardPage`
      pattern specifically because this page's content *is* a grid of cards, so a shape-matched placeholder avoids
      layout jump; `PageLoading` itself is untouched and still used as-is on the other two pages. Grid entrance
      uses a single shared `useScrollReveal` trigger (one `IntersectionObserver` for the whole grid, not one per
      card) with each card's reveal staggered by a capped `transitionDelay`, reusing the exact `.reveal`/
      `.reveal.is-visible` classes and reduced-motion contract from the landing page. Header restyled with the
      `.eyebrow` pill plus a small solved/total progress bar reusing the existing `.progress-bar-track`/`-fill`
      classes from `ProgressDashboardPage`. Category/difficulty/solved filtering logic, the solved/total count,
      per-card `/challenges/:slug` links, and the clear-filters affordance are all unchanged in behavior — only
      new class names/markup and the added search predicate.
      Verified: `npx tsc --noEmit` and `npm run build` clean; rebuilt and booted the real stack
      (`docker compose up --build -d`) and drove the actual backend API directly — confirmed all 27 real
      challenges across all 10 categories via `GET /api/challenges`/`GET /api/categories` (cross-checked category
      breakdown, difficulty counts, and a multi-word title-substring match against what the new search/filter
      logic would produce for several filter combinations). Confirmed solved state reflects real progress data
      end-to-end, not just static markup: signed up a fresh test user (0/27 solved), started a real session on
      `perm-executable-bit-missing`, `docker exec`'d the actual fix (`chmod +x` on the health-check script) into
      the live challenge container, called `POST /api/sessions/:id/check` (passed), stopped the session, and
      re-fetched `/api/challenges` — `solved` flipped to `true` for exactly that one challenge (1/27), which is
      what the restyled card/header/chip-filter logic consumes unchanged. Confirmed the container was torn down
      (no orphaned `app=devops-trainer` containers left after stop). Confirmed via the dev Vite server (`:5173`,
      the steady-state stack) that the served source matches what was written (fetched the raw
      `ChallengeListPage.tsx` module and grepped for the new markup/class markers). `:3000` (the production nginx
      path) returned connection-reset as expected under the dev-override stack — nothing listens on container
      port 80 while the override runs `npm run dev` on 5173 instead of nginx, consistent with how prior phases
      describe this same stack; not treated as a bug. No headless-browser tool was available to literally
      Tab/arrow-key through the new chip controls in a live page, so the roving-tabindex keyboard behavior was
      verified by reasoning through the concrete DOM/ARIA structure instead (each option is a real `<button
      role="radio">`, only the checked one has `tabIndex 0`, arrow keys update both `value` and call `.focus()` on
      the newly-active option's existing ref — which works regardless of React's render timing since `.focus()`
      is valid on any element, including `tabIndex="-1"` ones, at the moment it's called).

Also done as part of this pass, not separately itemized above: a small custom toast system
(`context/ToastContext.tsx`) for check-pass/check-fail/hint/error feedback, a dark, consistent design system
(`frontend/src/styles.css` — spacing/color/typography variables, difficulty/status badges, responsive challenge
grid), and `TerminalPane` now reports connection status (connecting/connected/disconnected) with a manual
"Reconnect" affordance if the WS drops unexpectedly instead of just going silent.

## Phase 4 — Bulk content authoring
Delivered 26 new challenges (27 total incl. the Phase 2 reference), all individually verified via the full
build → break-real-at-trainee-privilege → check-fails → fix-as-trainee → check-passes loop, AND end-to-end
through the real API + container lifecycle (start → exec fix → check → solved → teardown), including the
systemd (SYS_ADMIN+cgroup) and tmpfs container paths. Breadth prioritized over depth (≥2 per category, all 10
categories covered) per the phase guidance; this is short of the original ~47 target — remaining count noted
per category below.
- [x] Permissions & ownership — 3 new (perm-service-logdir-unwritable, perm-config-unreadable-by-app,
      perm-executable-bit-missing) + reference = **4/6**; 2 more to reach target
- [x] Disk & filesystem — 3 (disk-full-var-log, disk-inode-exhaustion, fs-broken-release-symlink) = **3/6**; 3 more
- [x] Process & performance — 2 (proc-runaway-cpu, proc-stale-pidfile) = **2/5**; 3 more
- [x] Networking & DNS — 3 (dns-hosts-entry-wrong, net-service-wrong-port, net-nginx-502-upstream) = **3/5**; 2 more
- [x] systemd & services — 3 (systemd-crashloop-bad-config, systemd-masked-service, systemd-bad-execstart-path) = **3/6**; 3 more
- [x] Logs & journald — 2 (logs-journald-not-persistent, logs-app-log-devnull) = **2/4**; 2 more
- [x] Package management — 2 (pkg-broken-alternatives, pkg-dpkg-unconfigured) = **2/4**; 2 more
- [x] Users/groups/sudo — 3 (user-not-in-group, user-nologin-shell, sudo-missing-privilege) = **3/5**; 2 more
- [x] Cron & scheduling — 2 (cron-daemon-not-running, cron-daily-not-executable) = **2/4**; 2 more
- [x] SSH & remote access — 3 (ssh-authorized-keys-perms, sshd-pubkey-auth-disabled, sshd-allowusers-blocks-user) = **3/5**; 2 more
- [x] Each challenge smoke-tested (build, break-visible, check fails before fix / passes after) before being added to the seed script
- Support added while authoring: per-challenge `tmpfs` (migration `0002`, schema + `docker.service.ts`) for
  authentic disk-full/inode scenarios (`decisions/0009`); `requires_systemd` container branch (`decisions/0010`);
  `challenges/AUTHORING.md` guide distilled from authoring these.

### Phase 4 follow-up pass — reached the original ~50 target
Delivered the remaining 23 challenges to close out every category to its target, reaching **50/50** total
(27 prior + 23 here). Same non-negotiable verification loop as above for every one of the 23 (standalone
`docker build` → run with the exact platform flags → `check.sh` fails before the fix → fix applied as the
unprivileged `trainee` (never root) → `check.sh` passes after), using the repo's `verify.sh` harness. Also
re-verified two of them (one plain container, one `requires_systemd`) end-to-end through the **real** stack:
signed up a fresh test user, started a real session via `POST /api/challenges/:slug/sessions`, `docker exec`'d
the fix into the actual live session container as `trainee` exactly as the terminal bridge would, called the
real `POST /api/sessions/:id/check` (passed both), confirmed `solved: true` via `GET /api/challenges`, stopped
both sessions, and confirmed clean container teardown with no orphans left behind. Rebuilt/restarted the
backend and confirmed all 23 in its boot log (`synced challenge` lines) and via `GET /api/challenges`
(50 total, exact per-category counts below). Test user and its DB rows deleted afterward; no leftover
containers or `verify/*` test images left on the host.
- [x] Permissions & ownership — 2 more (perm-setuid-helper-bit-stripped, perm-sticky-bit-missing-shared-dir) = **6/6 — target reached**
- [x] Disk & filesystem — 3 more (disk-space-held-by-deleted-fd, fs-noexec-mount-blocks-script, disk-full-apt-cache-buildup) = **6/6 — target reached**
- [x] Process & performance — 3 more (proc-memory-leak-runaway, proc-fd-leak-too-many-open-files, proc-zombie-process-leak) = **5/5 — target reached**
- [x] Networking & DNS — 2 more (net-port-conflict-stale-process, net-tls-cert-expired-nginx) = **5/5 — target reached**
- [x] systemd & services — 3 more (systemd-service-wrong-user, systemd-start-limit-reached, systemd-timer-bad-oncalendar) = **6/6 — target reached**
- [x] Logs & journald — 2 more (logs-logrotate-misconfigured, logs-rsyslog-facility-blackholed) = **4/4 — target reached**
- [x] Package management — 2 more (pkg-missing-shared-library-symlink, pkg-stale-dpkg-lock-file) = **4/4 — target reached**
- [x] Users/groups/sudo — 2 more (user-account-locked, user-home-dir-uid-mismatch) = **5/5 — target reached**
- [x] Cron & scheduling — 2 more (cron-job-fails-minimal-path, cron-missing-trailing-newline) = **4/4 — target reached**
- [x] SSH & remote access — 2 more (sshd-host-key-perms-too-open, sshd-match-forces-restricted-shell) = **5/5 — target reached**
- Two design pivots made mid-pass after live testing contradicted the original plan (see `decisions/0016`):
  a journald per-service rate-limit challenge never actually suppressed messages in this container/cgroup
  setup, and a persistent-journal-directory-permissions challenge got silently "healed" back to correct
  perms/ACLs by systemd's own tmpfiles logic before the trainee ever saw it broken — both replaced with
  `logs-rsyslog-facility-blackholed` (a `& stop` rule blackholing a syslog facility), which does not depend
  on journald's own internal enforcement and verified cleanly.
- New pattern used for several of these (not used in the first 27): compiling a small, purpose-built C
  helper at build time with `gcc` (setuid helper, leaking daemon, tiny shared library + consumer, a port
  hog) where a shell script couldn't express the needed mechanism (setuid is not honored on scripts at
  all; precise fd/memory behavior is awkward in `sh`). See `decisions/0016`.
- Not done: nothing outstanding from this pass — all 10 categories are at their planned target and the
  original ~50-challenge catalogue goal is met.

## Phase 5 — Hardening
- [x] Per-category resource-limit tuning — each challenge sets `resource_limits` in `challenge.json`; process &
      performance uses a deliberately tight 0.5 vCPU (whole "machine") so one busy loop starves it as premise;
      systemd challenges get 256MB; disk challenges bound their tmpfs size (20m/64m). Defaults elsewhere.
- [x] Idle reaper + orphan reconciliation testing — verified by SIGKILLing the backend mid-session (plus a rogue
      labeled orphan): next boot's `reconcileOrphans` removed the orphan, `markOrphanedSessionsError` marked the
      dead-container session `error`, no leftovers. Idle reaper verified with a 0-min timeout: container reaped,
      session → `expired`.
- [x] Concurrency cap / one-session-per-user — verified: starting a second session tears down the user's first
      (active session + container); with `MAX_CONCURRENT_SESSIONS=3`, 3 starts succeed and the 4th returns 429.
- [x] Structured logging — dependency-free leveled logger (`lib/logger.ts`, `LOG_LEVEL`); all `console.*` in
      services/jobs/ws/migrations/error-handler replaced. See `decisions/0011`.
- [x] Auth rate limiting — in-memory limiter (`middleware/rateLimit.ts`) on login (per IP+email) and signup
      (per IP); verified 429 after the limit and that a different account still logs in. `decisions/0011`.
- [x] Graceful shutdown on SIGTERM — drains active sessions (destroys containers, marks abandoned), closes WS,
      closes DB pool, 20s hard deadline. Verified against the production image (node PID 1). Dev hot-reload
      watcher can't drain (documented tradeoff); boot reconciliation is the safety net. `decisions/0011`.
- [x] Final security-notes documentation pass — README security section extended (isolation + Phase 5 hardening),
      not replaced.
- [x] Challenge-authoring guide — `challenges/AUTHORING.md`.
- [x] Cold-boot DB connection retry — found while independently re-verifying Phase 4/5 and the landing page's nginx
      fix in a fully isolated stack on a brand-new Docker network: the backend crashed 3/3 times on
      `getaddrinfo EAI_AGAIN postgres` at boot, a startup race the mid-session crash-recovery test above didn't
      cover (that test reused an already-established network). Fixed with a retry-with-backoff `waitForDatabase()`
      before the first migration query. See `decisions/0014-*.md`.
- Was an explicit shortfall at the time this line was first written (27/~47 delivered); closed out in the
  Phase 4 follow-up pass above — the catalogue is now 50/50 across all 10 categories. WS terminal drive for
  new challenges still isn't re-run per-challenge (the bridge itself was verified in Phase 2/3 and spot-checked
  again in the Phase 4 follow-up); lifecycle for individual new challenges is validated via the API + docker
  exec instead, consistent with how the original 27 were verified.

## Phase 6 — Public marketing/landing page
Not itemized in the original plan; added as a real route in the existing app (not a mockup), since the product
had no pre-login page explaining what it is before this.
- [x] `frontend/src/pages/LandingPage.tsx` — hero, animated stat counters, features grid, a numbered
      "what solving one incident looks like" walkthrough (replaces the generic testimonials slot — there are no
      real users to quote), a self-hosting/`docker compose` section (replaces pricing — this is free, there's no
      billing system to fake tiers for), FAQ (accordion via native `<details>`), footer. Scroll-triggered
      reveals, a condensing/glassmorphism sticky nav, and count-up stat tiles, all gated through
      `useReducedMotion`/`useScrollReveal`/`useCountUp` (`frontend/src/hooks/`) so `prefers-reduced-motion` fully
      disables the motion rather than just softening it. No fake trust badges, testimonials, pricing tiers, or
      GitHub link (this working directory isn't actually a git repo and no repo URL exists anywhere to link
      honestly — the hero's secondary CTA is an in-page "See how it works" scroll instead).
- [x] `GET /api/public-stats` (`backend/src/routes/publicStats.routes.ts`) — new, deliberately unauthenticated,
      returns only `{ challengeCount, categoryCount }` (real counts from `challenges`/`categories`, no user data)
      so the stats section stays accurate as content grows instead of a hardcoded number going stale. See
      `decisions/0012`.
- [x] Routing: `/` now renders `LandingPage` for logged-out visitors and redirects straight to `/challenges` for
      an already-authenticated user (`frontend/src/routes/RootRoute.tsx`), so a returning logged-in user never
      sees marketing copy on a routine visit/refresh. `LandingPage` is lazy-loaded *inside* `RootRoute` (not in
      `App.tsx`) specifically so an authenticated user's session never even fetches its chunk, and the
      authenticated app's own initial bundle doesn't carry it either — confirmed via `npm run build`:
      `LandingPage-*.js` is its own ~15KB chunk, not present in `index-*.js`. `AuthForm` also gained a small
      `?mode=signup` query-param read so the hero/footer "Get started" CTAs land a new visitor straight on the
      signup form.
- [x] Verified: `npx tsc --noEmit` clean on both packages, `npm run build` clean with the expected extra chunk;
      rebuilt and booted the real stack (`docker compose up --build -d`), curled `/api/public-stats` with no
      auth header (`{"challengeCount":27,"categoryCount":10}`), confirmed `/`, `/challenges` (hard refresh), and
      the landing page's own asset chunk all serve correctly through both the dev Vite proxy (:5173) and — after
      fixing an unrelated pre-existing nginx bug found in the process, see below — the real production nginx
      image (:3000). Left the dev-override stack running as the steady state afterward; all test users and the
      one challenge container spawned while verifying the WS path through nginx were cleaned up.
- [x] **Unplanned fix, found during the above verification**: `frontend/nginx.conf`'s `/api/` and `/ws/`
      `proxy_pass` directives were silently dropping every path segment past the location prefix in real
      production mode (confirmed on a pre-existing, untouched endpoint — not something this page's change
      introduced), which meant the WS terminal bridge itself was broken end-to-end in production and had only
      ever been exercised through the dev Vite proxy. Fixed and verified via a raw WS client through nginx port
      3000. See `decisions/0013`.

## Phase 5 follow-up — session-stop bug fixes (post-Phase 6)
Two related bugs in the stop flow, reported against `docker.service.ts`'s `destroyContainer()` and
`ChallengeDetailPage`/`TerminalPane`'s stop handling; a third, closely-related bug in the same flow was found
while verifying the fix and fixed alongside it.
- [x] **Stop latency (~5s, should be near-instant)**: `destroyContainer()` called `container.stop({ t: 5 })`
      before `container.remove({ force: true })`. Challenge containers run as PID 1 directly (`sleep infinity`,
      or `/sbin/init` for systemd challenges) with no SIGTERM handler installed — on Linux, PID 1 gets kernel
      default-disposition-is-ignored semantics for unhandled signals, so `stop()` reliably burned its whole
      timeout before force-killing. Since these are disposable, single-use containers with nothing to flush
      gracefully, and `remove({ force: true })` alone already SIGKILLs a still-running container as part of
      removal, the `stop()` call was simply redundant. Removed it. See `decisions/0015`.
      Measured directly against the real stack (`docker compose up --build -d`, `time curl .../stop`): **5.114s
      before → 0.067s after** for a `sleep`-style challenge (`perm-config-blocks-service`), **0.082s after** for a
      real systemd-in-Docker challenge (`systemd-masked-service`, confirmed PID 1 is `systemd` via
      `docker exec ... ps -p1`) — force-remove alone tears down both cleanly with no orphan left behind
      (`docker ps -a --filter label=app=devops-trainer` empty after each stop in both cases).
- [x] **Spurious "Terminal connection lost" toast + "Disconnected"/"Reconnect" UI flash on every intentional
      stop**: `TerminalPane` stays mounted with its WS still open until the stop mutation's `onSuccess` unmounts
      it; in between, the backend killing the container closes the WS bridge server-side, which `TerminalPane`
      has no way to distinguish from a genuine unexpected disconnect (its own `intentionalClose` flag is only
      set on unmount/reconnect, not by the parent already knowing a stop is in flight) — so it fired `onExit`
      and the disconnected/"Reconnect" UI right before the panel disappeared anyway. Fixed with a `stoppingRef`
      in `ChallengeDetailPage`, set `true` at the start of `handleStop` (before the mutation call) and checked by
      both the exit-toast handler and a new `onStatusChange` wrapper, so the parent — which knows the stop was
      user-initiated — suppresses both, without touching `TerminalPane` itself. Cleared on stop error (a failed
      stop leaves the session genuinely live) and on challenge/slug change.
- [x] **Found during verification, fixed alongside the above**: a related but distinct spurious error toast
      ("session is not running") could fire on stop, from a *different* code path — the resume-on-mount effect
      (added in Phase 3, `decisions/0008`) reacting to `activeSessionQuery`'s stale cached data. Stopping
      invalidates that query (triggering a background refetch) but React Query doesn't clear `data` synchronously,
      so the render where local `session` flips to `null` can still see the just-stopped session as "active" and
      try to resume it, hitting the backend's 409. Fixed with a `stoppedSessionIdsRef` (a `Set`, not a blanket
      flag) recording session IDs this component itself stopped, checked by the resume effect — scoped by ID
      so it only ever suppresses resuming that specific stale session, never a genuinely new one that later
      appears for the same slug.
- [x] Verified end-to-end: `npx tsc --noEmit` clean on both packages, `npm run build` clean on frontend; rebuilt
      and booted the real stack. Backend flow driven via curl (signup → start session → timed stop → confirmed
      container gone). Frontend flow driven with Playwright + real Chromium (installed ad hoc into the scratch
      dir for this verification only, not added to the project) against the live dev server at `:5173` since no
      headless browser was available in-session before: confirmed an intentional stop shows only "Session
      started"/"Session stopped" toasts (screenshot-verified, no error toast, no disconnected/reconnect flash),
      and — separately — that force-killing a challenge container *out-of-band* (`docker rm -f`, not via the
      Stop button) still correctly shows "Terminal connection lost" plus the "Disconnected"/"Reconnect" UI
      (screenshot-verified), confirming the suppression is scoped to self-initiated stops only. All test users,
      sessions, and containers created during verification were cleaned up afterward; dev stack left running.

## Phase 6 follow-up — landing page visual redesign (Stripe-inspired layout patterns, dark theme kept)
Purely a layout/visual pass over `frontend/src/pages/LandingPage.tsx` and the landing section of
`frontend/src/styles.css` — content, copy, code-splitting, and the scroll-reveal/reduced-motion conventions from
Phase 6 are untouched. Goal was to borrow Stripe's *structural* patterns (bento-grid feature layout, wave/gradient
hero backdrop, strong headline/subhead type-scale contrast, card depth + hover, single-primary-CTA hierarchy) and
translate them into the existing dark palette — not a theme flip, no Stripe branding/copy/illustrations reused.
- [x] **Hero**: restructured into `.hero-section` (full-bleed, `overflow:hidden`) containing a decorative
      `.hero-bg` layer — three low-opacity radial gradients built from the app's existing semantic tokens
      (`--color-accent`/`--color-success`/`--color-warning`, the same three colors already used for the
      terminal-mock traffic-light dots) plus a faint repeating dot-grid, animated with a slow 28s drift
      (`hero-mesh-drift`) — and a short single-path SVG wave (`.hero-wave`, ~10 path commands, not hand-authored
      illustration-scale) that seams the hero into the stats section below, whose color matches
      `--color-bg-elevated` so the two sections read as one continuous shape. Both the drift animation and the
      `.feature-card`/`.btn-arrow` hover transforms are frozen under `prefers-reduced-motion` via the existing
      reduced-motion block at the end of `styles.css`. `.hero` content itself is now `z-index: 2` above the
      backdrop; layout/copy unchanged. Headline type-scale contrast increased: `.hero h1` now `clamp(2.25rem …
      3.75rem)` at `font-weight: 800` / `letter-spacing: -0.025em` (previously inherited the global 600-weight
      h1 rule capped at 3.1rem); `.hero-sub` kept at `font-weight: 400`, dropped slightly to `clamp(1rem …
      1.1rem)` so the gap between headline and subhead reads clearly rather than both sitting in the same
      visual weight class.
- [x] **Features → bento grid**: `.features-grid` is now an asymmetric grid instead of a uniform 2/3-column one.
      Card 1 ("a genuinely broken container") spans 2 cols × 2 rows as the anchor tile (bigger icon chip, bigger
      heading, stronger tint) at ≥1020px; card 5 ("ten real incident categories") spans the full row as a
      horizontal banner instead of a stacked block, since its content is naturally list-shaped, not tall.
      `grid-auto-flow: dense` backfills the remaining four 1×1 cards with no manual row/column bookkeeping —
      verified by hand-tracing the placement algorithm (documented in the CSS comment) to confirm no empty grid
      holes open up at the 2-col (720–1019px) or 4-col (≥1020px) breakpoints; falls back to a plain single-column
      stack below 720px. Depth: each card got a resting shadow + top-sheen gradient (previously flat, shadow
      only appeared on hover), reusing the same treatment already established on `.challenge-card`/`.auth-card`
      rather than inventing a new one; hover now lifts further (`translateY(-4px)`, was `-3px`) with a stronger
      accent-tinted glow. Icons moved into a new `.feature-icon-chip` (tinted rounded-square badge) rather than
      floating bare above the heading.
- [x] **CTA hierarchy**: audited — was already single-primary (`.btn-primary`) plus ghost/text secondary actions
      in nav, hero, and final CTA, no competing solid buttons found. Only change: added a small trailing-arrow
      glyph (new shared `.btn-arrow` class, nudges right on hover, frozen under reduced-motion) to the hero's
      "See how it works" ghost CTA so it reads more clearly as an understated in-page link rather than a second
      button competing with "Get started".
- [x] **Vertical rhythm**: added a `--space-8: 72px` token; `.landing .section` padding and `.section-head`
      bottom margin step up to it at ≥860px (was a flat `--space-7`/48px at all widths). `.hero` top padding at
      ≥860px also moved to `--space-8`. `.features-grid` gap bumped `--space-4` → `--space-5`.
- [x] Verified: `npx tsc --noEmit` and `npm run build` both clean; `LandingPage-*.js` chunk unchanged at ~15KB
      (no bundle regression), confirmed via the built `dist/assets/` output. Rebuilt and booted the real stack
      twice — once against the base `docker-compose.yml` only (bypassing the dev override) to exercise the real
      production nginx image on `:3000` the way Phase 6's original verification did, confirming `/`, the built
      `index-*.js`/`.css`, and `/api/public-stats` (proxied through nginx, `{"challengeCount":50,"categoryCount":10}`,
      matching the now-complete 50-challenge catalogue) all serve correctly and that the new CSS
      (`grid-auto-flow:dense`, `hero-mesh-drift`, `feature-icon-chip`, `hero-wave`) and JSX markup
      (`hero-bg`, `feature-copy`, `btn-arrow`) actually made it into the deployed bundle — then rebuilt again
      with the dev override (the project's documented steady state) and confirmed `:5173` and `/api/public-stats`
      still serve correctly through it. **No headless browser was available in this pass**, so the bento-grid
      placement, gradient-mesh contrast, and wave-divider alignment were verified by reasoning through the actual
      CSS (grid auto-placement traced by hand, gradient opacities checked against the near-black ground) rather
      than a rendered screenshot — a real-browser look (light hover states, the drift animation's motion, and
      the bento grid's actual proportions at a few viewport widths) is still worth the user doing themselves.

## Phase 6 follow-up 2 — dark → light theme flip (app-wide, single theme, no toggle)
Full color/surface-treatment pass over `frontend/src/styles.css` (plus one `LandingPage.tsx` inline-style fix and
one `index.html` meta tag) — layout, component logic, and copy untouched everywhere. See `decisions/0017-*.md` for
the complete before/after palette, the actual computed contrast ratios, and the reasoning behind every non-obvious
call; this entry is a summary.
- [x] Re-picked every token in `:root` for a light ground rather than inverting the dark values: soft off-white
      page (`#f2f4f8`), pure-white card surface (`#ffffff`, brighter than the page so elevation lifts up instead
      of down), a darker inset-surface tone (`#e8ebf1`) for inputs/code/chips, near-black text (`#171a23`), and
      re-saturated/darkened accent/success/danger/warning hues (the old dark-tuned hex values were all
      under-contrast as text on light — verified by computing WCAG contrast ratios by hand, not by eye; numbers in
      the decision doc). Added `--color-*-rgb` channel tokens so every `rgba(<semantic color>, alpha)` tint/glow in
      the file stays wired to the token instead of a hardcoded triplet (~25 sites fixed; these would have silently
      gone stale — still pointing at the *old* blue/green/red/amber — the moment the base hex changed).
- [x] Found and re-treated all 9 hand-tuned `rgba(255,255,255,…)`/`rgba(0,0,0,…)` dark-mode overlay values (toast/
      feature-card/auth-card shadows, spinner ring, hero-bg dot-grid, feature-card gloss lines, hero-terminal
      shadow) — none left as-is. Shadows moved to a shared ink-toned `--color-shadow-rgb` token at light-appropriate
      low opacity (two-layer tight+ambient, the standard light-mode elevation pattern); the feature-card "glossy
      top edge" lines were removed outright rather than recolored, since a white-tinted highlight on an
      already-pure-white card is a no-op — elevation there now comes from shadow alone. Also found and fixed two
      more hardcoded dark-specific colors outside that list: the landing-nav/auth-card frosted-glass backgrounds
      (`rgba(15,17,21,.72)`/`rgba(23,26,33,.72)`, dark navy glass) flipped to `rgba(255,255,255,.78)`, white glass.
- [x] Re-tuned the hero's gradient-mesh (`.hero-bg`) and dot-grid opacities for a light ground (a saturated color
      needs less alpha to register on light than the old lighter hues needed on near-black); `.hero-wave` needed no
      change since its fill was already token-driven (`var(--color-bg-elevated)`), so it tracks the flip
      automatically.
- [x] **Terminal exception**: `TerminalPane`/`xterm.js` needed zero code changes — it never had a `theme` passed to
      `new Terminal()`, so it already renders xterm's own default dark theme regardless of the surrounding app, and
      its `.terminal-wrap` background is a hardcoded `#000` untouched by this pass. `.terminal-status` (the
      connection dot/Reconnect button) sits outside `.terminal-wrap` in the ordinary light chrome and correctly
      picked up the new tokens. Separately (a related but distinct call, documented in `decisions/0017`), the
      landing page's decorative `.hero-terminal` mock and the self-host `.code-block` snippet were also kept dark
      since they visually represent that same real terminal — both were wired straight to the app's semantic
      tokens and would have silently broken (near-black text on a near-black mock) once those went light, so they
      were rewired to a new dedicated `--term-mock-*` token set that preserves the old dark palette verbatim,
      scoped only to these two surfaces.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean; grepped the built `dist/assets/index-*.css` and
      confirmed the new `:root` block (`--color-bg: #f2f4f8`, `--color-accent: #3562e0`, `color-scheme:light`, …)
      made it into the actual bundle, not just the source. Rebuilt and booted the real stack twice — once against
      the base `docker-compose.yml` only to exercise the production nginx image on `:3000` (confirmed `/`, the
      built CSS through nginx byte-for-byte matches the direct build, and `/api/public-stats` still returns
      `{"challengeCount":50,"categoryCount":10}`), then rebuilt again with the dev override (documented steady
      state) and confirmed `:5173`'s live Vite-served `styles.css` also carries the new tokens. Computed actual
      WCAG contrast ratios (relative-luminance formula, not eyeballed) for body/muted/faint text on both surfaces,
      button text on button background, and badge text on badge background — all clear AA 4.5:1, several clear or
      nearly clear AAA 7:1; full numbers in `decisions/0017-*.md`. **No headless browser was available**, so the
      actual rendered look (gradient/wave feel, shadow softness, hover states, frosted-glass blur) was verified by
      reasoning through the CSS/built output rather than a screenshot — a real look in a browser is still worth the
      user doing themselves, same caveat as prior visual passes. Dev-override stack left running as the steady
      state afterward; no test artifacts or extra containers were created by this pass.

## Phase 6 follow-up 3 — light theme texture + micro-interaction pass ("too basic" feedback)
Restrained polish pass on `frontend/src/styles.css` only in response to feedback that the freshly-flipped light
theme read as "too basic" — explicit user constraint was restraint ("don't over do it"), so this stayed to a small,
deliberate set of additions rather than a broad redesign. No JSX/layout/component-logic/copy touched; every new
animation routes through the existing reduced-motion contract (the global `prefers-reduced-motion` block at the end
of the file), nothing bypasses it.
- [x] **Texture** — one new `--texture-grain` token in `:root`: a small (160×160) `feTurbulence` fractal-noise SVG
      tile with the alpha baked directly into the SVG's `feColorMatrix` (0 to 0.05, averaging ~0.025 — i.e. the
      "2-4%" range asked for) rather than controlled via a CSS `opacity`, since the latter would also fade any text
      sharing that surface. Applied in two spots: (1) `body`'s page background (split the old single `background`
      shorthand into `background-color`/`background-image` so the grain layers over the flat ground on every page),
      and (2) a curated list of large, mostly-single-instance elevated surfaces — `.card`, `.challenges-toolbar`,
      `.auth-card`, `.feature-card`, `.stats-section` — declared as a standalone rule near the end of the file so it
      wins the cascade for just `background-image` at equal specificity without touching each surface's own
      existing background rule. Deliberately *not* applied to the challenge grid's many small tiles, toasts, or FAQ
      rows — tiling a barely-perceptible accent across dozens of small elements would turn it into visible per-tile
      noise, the opposite of restraint.
- [x] **Animation** — four targeted additions, reusing the file's one existing "signature" easing curve
      (`cubic-bezier(0.16, 1, 0.3, 1)`, already used by `.reveal`/`.auth-shell-animate`/`.auth-collapse`) for every
      new transition instead of inventing a second easing family:
      1. `.btn-primary` gets a restrained hover lift (`translateY(-1px)` + a tinted `rgba(accent, .35)` glow,
         160-200ms) — scoped to primary CTAs only (Start Challenge, Check My Fix, auth submit, hero/final CTAs) so
         it reads as "the one thing to click," not applied to every button variant.
      2. `.challenge-card`/`.feature-card` hover transitions swapped from plain `ease` to the shared curve (same
         180ms duration, same translateY/shadow values — just a more considered deceleration).
      3. `.nav-link` (the in-app navbar) had no hover transition at all before this pass — added one.
      4. `.alert` (covers the "Check My Fix" pass/fail result banner, not just the separate `.toast` system) gets a
         soft 200ms fade+rise entrance instead of snapping into place, matching the existing `.toast-in` treatment.
      Reviewed but left unchanged as already adequate: the skeleton shimmer sweep (already a genuine gradient sweep,
      not a static pulse) and the chip/filter-toggle transition (already has a gentle 140ms color transition).
      Extending the existing `.btn-arrow` icon-shift pattern to other CTAs was considered but would require adding a
      markup element in `LandingPage.tsx` — out of scope for a CSS-only pass under the "don't touch layout/component
      logic" constraint; the primary-button hover lift above serves the same "considered CTA hover" role instead.
      `.btn-primary:hover` also added to the reduced-motion block's explicit transform-cancel list (existing
      convention already used for `.feature-card`/`.challenge-card` hover), not just left to the global
      duration-zero wildcard.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean. Decoded and XML-parsed the `--texture-grain` data URI
      standalone to confirm it's well-formed before trusting it in the browser. Grepped the built
      `dist/assets/index-*.css` and confirmed every change landed in the actual bundle (the token, the `body`
      split, the curated grain selector list, `.nav-link`'s new transition, `@keyframes alert-in`, the
      `.btn-primary:hover` lift/glow, and its reduced-motion cancellation). Rebuilt and booted the real stack
      (`docker compose up --build -d`); `postgres` healthy, backend `/health` OK, and confirmed the dev-override
      Vite server on `:5173` serves the updated `styles.css` live with all of the above present — `:3000` wasn't
      checked this pass since the dev override (the documented steady state) runs Vite directly and doesn't listen
      on port 80 inside the container, matching how the prior light-theme-flip pass described that mode. **No
      headless browser was available in this environment**, so the actual felt subtlety of the grain and the hover
      motion was verified by reasoning through the exact alpha/timing values chosen (documented above), not a
      screenshot — whether "don't overdo it" actually landed is a taste call that a real look in a browser is still
      the best (and only real) judge of. Dev-override stack left running as the steady state; no test artifacts or
      extra containers created by this pass.

## Phase 6 follow-up 4 — visual identity pass (accent hue, self-hosted typography, hero signature element)
Full pass per the approved "Visual Identity Pass" addendum (using the newly-installed `frontend-design` skill plus
`vercel-react-best-practices`), in response to feedback that the app "should not look basic." Pure visual/typography
pass — no session lifecycle, auth, WebSocket protocol, data fetching, filter logic, or routing changes; the only
edit inside a functionally live file is one additive `fontFamily` prop (plus a directly-related font-load robustness
addition next to it) on `TerminalPane.tsx`. Full rationale and numbers in `decisions/0018-visual-identity-pass.md`.
- [x] Installed the `frontend-design` skill (`npx skills add anthropics/skills@frontend-design`); confirmed
      `vercel-react-best-practices` was already installed from Phase 0 rather than reinstalling blind.
- [x] **Accent hue**: `--color-accent` `#3562e0` → `#0e7490` (deep signal-teal, the ANSI hue conventionally used for
      paths/prompts/hostnames in terminal schemes) — a two-token edit (`--color-accent`, `--color-accent-rgb`)
      thanks to `decisions/0017`'s earlier `rgba(var(--color-accent-rgb), alpha)` refactor. `-hover`/`-active`
      re-derived via HSL lightness steps (31% → 25% → 19%) rather than picked by eye. Success/danger/warning
      unchanged. Recomputed real WCAG contrast (script, not eyeballed) for every usage context — buttons 5.36:1
      (7.41:1 hover, 10.22:1 active), links 5.36:1/4.87:1, tinted badge-style labels 4.67:1/5.90:1 — all clear AA.
      Found (and fixed) one pre-existing sub-AA gap along the way: `.walkthrough-index` scored ~4.26:1 with the new
      hue and ~4.21:1 with the *old* one (not a regression) — fixed by swapping its text color to
      `--color-accent-hover`, the same token `.eyebrow` already used against the identical tint, clearing 5.90:1.
- [x] **Typography**: Overpass (display, 700/800) + IBM Plex Sans (body, 400/500/600) + IBM Plex Mono
      (mono/utility, 400/500), replacing the old 100%-system-font stack. Self-hosted via `@fontsource` npm packages
      (real `.woff2` files, no runtime Google Fonts CDN dependency) — an adjustment from the plan's originally-
      described hand-placed `frontend/public/fonts/` binaries, since `@fontsource` ships the same real files
      version-managed like any other dependency; documented in `decisions/0018-*.md` along with why. Wired into
      `--font-display`/`--font-body`/`--font-mono` tokens, consumed by `body` and the base `h1-h4` rule (cascades to
      every heading site-wide automatically, matching the addendum's own scope rule). `.walkthrough-index` already
      referenced `var(--font-mono)`, so it picked up Plex Mono for free with no code change. Added a `vite.config.ts`
      `assetFileNames` override giving font files a stable, un-hashed path so `index.html`'s two `<link
      rel="preload">` tags (Plex Sans 400, Overpass 800) reference the exact same URL the built CSS's `@font-face
      src` actually requests — a second, related adjustment from the plan's assumption of hand-known static paths,
      also documented in `decisions/0018-*.md`.
- [x] **Terminal font unification**: `TerminalPane.tsx`'s `new Terminal({...})` now sets
      `fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace'` (previously unset, xterm's own
      default). Additive/non-blocking. Alongside it, the initial `fit.fit()` now also re-runs once
      `document.fonts.ready` resolves (guarded against post-unmount), closing the gap where the very first fit could
      measure off a fallback font before Plex Mono finishes loading.
- [x] **Hero signature element** (the one bold visual moment in the whole pass — everywhere else just inherits the
      new tokens/typography via cascade): resized the hero terminal to visually dominant (`.hero` grid
      `1.05fr 1fr` → `0.78fr 1.22fr` at ≥860px, terminal body font/line-height/padding bumped a step, switched to
      wrapping instead of horizontal scroll for the wider column); added a scroll-triggered (reusing the existing
      `useScrollReveal` hook, no new infra) character-by-character transcript reveal (~6ms/char, ~2.8s for the
      470-character transcript, text unchanged from before this pass) driven by a ref + `requestAnimationFrame` loop
      that mutates each character span's class directly via a ref array — not per-character `useState`, per
      `vercel-react-best-practices`' "use `useRef` for transient values" guidance, so the only React state update in
      the whole sequence is one flip when the last character lands; a new 3px status strip on the terminal chrome
      transitions `--term-mock-danger` → `--term-mock-success` (600ms, the file's existing signature easing curve)
      in sync with that same state flip. Gated by both `useReducedMotion` (skips straight to the finished state,
      backed by a redundant CSS `!important` override for the one-frame gap before the effect runs) and
      `useScrollReveal`, exactly like every other animation on the page. No new dependency.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean. Grepped the built `dist/assets/index-*.css` and
      confirmed all 7 expected `@font-face` rules, each pointing at a real file that exists under
      `dist/assets/fonts/`; confirmed `index.html`'s two preload `href`s are byte-identical to the paths the built
      CSS's own `@font-face src` references for those same files; confirmed the new `--color-accent*`/`--font-*`
      tokens landed verbatim; confirmed the hero reveal logic and the `fontFamily` string are present in their
      respective code-split JS chunks, not just source. Computed every contrast ratio via the WCAG relative-
      luminance formula in a script, not eyeballed — full table in `decisions/0018-*.md`. Rebuilt and booted the
      real stack (`docker compose up --build -d`); `postgres` healthy, backend `/health` OK, dev-override `:5173`
      confirmed serving the new tokens live. Terminal-resize verification: no headless browser available, so
      verified at the protocol level instead — signed up a real account, started a real session against
      `perm-config-blocks-service`, connected to `/ws/terminal` with the same message protocol `TerminalPane.tsx`
      uses, and confirmed `stty size` inside the live PTY exactly matched a `{cols:120, rows:40}` resize message
      sent over the socket, confirming the backend PTY resize path is unaffected by the frontend font change.
      **No headless browser was available in this environment**, so the actual rendered look (how dominant the
      resized hero terminal feels, the reveal's pacing, `FitAddon`'s real in-browser cols/rows) was verified by
      reasoning through the exact CSS/JS values and built output rather than a screenshot — a real look in a browser
      is still worth the user doing, same caveat as every design pass before this one. Test session/container torn
      down via the stop API immediately after (confirmed zero `app=devops-trainer` containers remained) and the two
      throwaway test accounts deleted from `users`; dev-override stack left running as the steady state.

## Phase 7 — Authenticated dashboard, profile/password-change, landing page redesign (round 3)
Three pieces of direct user feedback, tackled together: (1) no real authenticated "home" — the navbar brand link
and post-login redirect both just pointed at `/challenges`, so clicking the brand while already there did nothing
visible; (2) no account/profile page at all, and specifically no way to change a password; (3) another landing-page
design pass, since the Stripe-bento/theme-flip/texture/visual-identity passes (`decisions/0012`–`0018`) hadn't
landed for the user yet. Full rationale in `decisions/0019-dashboard-profile-landing-redesign.md`.

- [x] **New `/dashboard` route — the real authenticated home.** `frontend/src/pages/DashboardPage.tsx`. `RootRoute`
      now redirects authenticated visitors to `/dashboard` (was `/challenges`); `NavBar`'s brand link and a new
      "Dashboard" nav item both point there too. Contains: a welcome header (display name, falling back to the
      email's local-part); a "continue where you left off" card that reuses the *exact same* `useActiveSession()`
      query `ChallengeDetailPage` already uses for resume (no parallel session-fetching logic); a progress snapshot
      card built on the *exact same* `useProgress()` query/cache entry `/progress` reads (top 3 categories by solve
      rate + the overall bar), so the two pages can never show diverging numbers — see the decision doc for why this
      is a shared-query summary rather than a second computation; a "pick up next" row of up to 3 unsolved challenge
      cards (falls back to "revisit a solved one" if none are unsolved) built on the same `useChallenges()` query
      `/challenges` uses; and a quick-links card (Browse challenges / Full progress / Account settings).
      **`Challenges` and `Progress` stay as separate nav items and separate pages, unchanged** — Dashboard is a
      lighter summary layered on top of the same data, not a replacement for either.
- [x] **New `/profile` route — account settings, including password change.** `frontend/src/pages/ProfilePage.tsx`,
      linked from the navbar (the user's display name/email in the top-right is now a `NavLink` to `/profile`
      instead of inert text). Two cards: display-name edit (simple, no password needed) and change-password
      (current / new / confirm, reusing the exact same `useNoSpaceField` hook the login/signup form uses — pulled
      out of `AuthForm.tsx` into a shared `frontend/src/hooks/useNoSpaceField.ts` so both forms stay identical
      instead of drifting). Backend: `POST /api/auth/change-password` (verifies the current password via
      `bcrypt.compare` before allowing any change — no exception — then re-hashes and updates; same 8-char/no-
      whitespace validation as signup) and `PATCH /api/auth/display-name` (no password check — a cosmetic field,
      same as at signup). The change-password route gets the same `rateLimit()` middleware already used on
      login/signup, but keyed by `req.userId` (post-`requireAuth`) rather than IP, since the point is limiting
      attempts against *one account* regardless of source IP.
- [x] **Landing page — third design pass**, this time taking explicit structural/interaction cues from
      supabase.com (real interface as the visual language, not just in the hero) plus hand-implemented versions of
      two shadcn/Aceternity-style component patterns, with an explicit "precision over quantity" brief given the
      user's history of animation reading either gimmicky or too subtle. No new dependency. See
      `decisions/0019-*.md` for the full before/after reasoning against `decisions/0012`–`0018`.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean on both packages (one real bug caught in the process —
      a CSS comment containing a literal `challenges/*/` path closed the comment block early via the embedded
      `*/`, corrupting everything after it; esbuild's CSS minifier flagged it as a syntax warning during
      `npm run build`, traced to the exact line, and reworded to avoid the sequence — confirmed the warning is gone
      and the built CSS contains the intended rules on rebuild). Rebuilt and booted the real stack
      (`docker compose up --build -d`); `postgres` healthy, backend `/health` OK. Exercised the real backend
      end-to-end, not just compiled code: signed up a fresh account, confirmed `/api/auth/me`, `/api/sessions/active`
      (null, as expected pre-session — the exact query the dashboard's continue-session card uses),
      `/api/progress`, and `/api/challenges` (50 challenges, real titles/categories — the exact queries the
      dashboard's progress/recommended sections use) all return real data through a bearer token. Changed that
      account's password via `POST /api/auth/change-password`: confirmed a wrong current password is rejected
      (400, generic message, no information leak), a new password containing whitespace is rejected (400), the
      correct current password succeeds (200), a subsequent login with the *old* password then fails and a login
      with the *new* password succeeds — the full round trip, not just "the endpoint returns 200". Confirmed the
      rate limiter: repeated wrong-password attempts against the same account started returning 429 after the
      configured threshold, and a *second, unrelated* account's own change-password attempt right afterward still
      returned a normal 400 (not 429) — proving the limiter is keyed per-user, not global/per-IP. Confirmed the nav
      fix by code trace (no headless browser available): `NavBar`'s brand `NavLink` now targets `/dashboard`, which
      is a distinct registered route/component from `/challenges`, so clicking it while already on `/challenges`
      navigates to different, real content instead of no-op-ing. **No headless browser was available in this
      environment**, so the landing page's actual rendered feel (the spotlight-hover glow, the animated hero
      border, the walkthrough terminal's layout) was verified by reasoning through the exact CSS and by grepping the
      built `dist/assets/index-*.css`/`LandingPage-*.js` for every new class/token landing in the real bundle, not a
      screenshot — a real look in a browser is still worth the user doing, same caveat as every design pass before
      this one. Test accounts created during verification (`test-verify-*@example.com`,
      `test-verify2-*@example.com`, `test-dash-*@example.com`) were deleted from `users` afterward; `docker ps -a
      --filter label=app=devops-trainer` was empty throughout (this pass never started a real challenge session, so
      no container cleanup was needed). Pre-existing users/rows from earlier sessions' testing were left untouched
      — not this pass's artifacts to clean up. Dev-override stack left running as the steady state.

## Phase 7 follow-up — `/about`: a way back to the public landing page (post-Phase 7)
Phase 7's dashboard fixed "clicking the brand link while already on the challenge list does nothing" — but left a
different gap the user then hit directly: once logged in, there was no link anywhere back to the public marketing
page at all, since `RootRoute` deliberately redirects any authenticated visit to `/` straight to `/dashboard`. See
`decisions/0020-*.md`.
- [x] New `/about` route (`frontend/src/App.tsx`) renders the same `LandingPage` component outside `RootRoute`'s
      auth redirect, so it's reachable regardless of login state. `NavBar` gets an "About" link to it. `/` itself is
      unchanged — still redirects a logged-in visitor away, per Phase 7's original reasoning.
- [x] `LandingPage`'s four CTAs (`LandingNav`, `Hero`, `FinalCta`, `LandingFooter`) are now auth-aware via
      `useAuth()`: logged out sees "Log in"/"Get started" as before; logged in sees "Go to dashboard" instead,
      since showing a login prompt to someone already logged in is confusing even though it isn't broken.
- [x] Fixed a related staleness found while touching this: `LoginPage` redirected an already-authenticated user to
      `/challenges`, a holdover from before `/dashboard` existed. Now matches `RootRoute` and redirects to
      `/dashboard`.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean. Confirmed via the build output that `LandingPage`
      still resolves to a single shared chunk (one `LandingPage-*.js`, not two) — the second route doesn't
      double-ship its JS, since both dynamic `import()` calls (in `RootRoute.tsx` and `App.tsx`) share the same
      module specifier.

## 2026-07-25 — Dashboard/Progress design pass: donut-ring progress, non-interactive category tiles
`/progress` was still the original flat "one h1 + one card of stacked category rows" from before the Dashboard even
existed, visually thinner than the page it now sits next to. This pass rebuilds it as a hero summary card + small-
multiples category grid, and brings a few of the Dashboard's own still-missing touches (animated live-session dot,
a real empty state, per-category mini bars) up to parity. Zero new npm dependencies — every effect is hand-built
CSS custom properties + inline SVG, same convention as every prior pass. See `decisions/0021-*.md` for the full
rationale, including why the new donut ring is a direct extension of the existing `--border-angle` hero-terminal
trick, why category tiles have no per-category icons (data-driven status badges instead), and why they're
deliberately non-interactive (`ChallengeListPage`'s category filter is local `useState`, not a URL param, so a
`/challenges?category=slug` link would silently do nothing).
- [x] `frontend/src/components/ui.tsx`: promoted `Reveal` (previously local-only to `LandingPage.tsx`) into a 5th
      shared export, identical signature/behavior. `LandingPage.tsx`'s own copy is untouched — accepted duplication,
      out of scope for this pass.
- [x] `frontend/src/pages/DashboardPage.tsx`: page header, the continue-session card (all three branches), the
      progress snapshot card, the recommended-challenges grid, and the quick-links card all now go through
      `Reveal`. The live-session branch restructures so `Reveal` (carrying the spotlight `onPointerMove`) is the
      outer card and the `<Link>` becomes a full-bleed inner anchor (`.dashboard-continue-card-link`). The empty
      branch gets real content instead of a bare paragraph: `TerminalIcon`, a bold "No session running" headline,
      and a genuine "Start a challenge →" CTA. The progress snapshot card's solved count now counts up
      (`useCountUp`) and its bars (main + new per-category mini bars) animate in from 0% only once scrolled into
      view, gated by `useScrollReveal` called unconditionally at the top of the component (hook order stays stable
      across its loading/error/success branches). The recommended grid's cards get a staggered `reveal`
      transitionDelay keyed off their array index.
- [x] `frontend/src/pages/ProgressDashboardPage.tsx`: full rewrite. New hero `progress-summary-card` (large donut
      ring + count-up solved/total + a "N/10 categories complete" stat derived client-side, spotlight-glow on
      pointermove) above a `progress-category-grid` of small `CategoryTile`s — one per category, in the same fixed
      order `/api/progress` returns (deliberately not re-sorted, per the existing 0019 "fixed category order" rule
      for this page specifically — Dashboard's own top-3 teaser is still allowed to sort). Each tile shows a small
      donut ring + solved/total count when `total > 0`, or an explicit "No challenges seeded in this category yet."
      empty-state message when `total === 0`, plus a status badge (`badge-neutral` / new `badge-status-progress` /
      new `badge-status-complete`) derived from `{ total, solved }`. Both pages keep reading the exact same
      `useProgress()` query/cache entry — nothing about the data-fetching layer changed.
- [x] `frontend/src/styles.css`: renamed `.dashboard-card-kicker` to `.kicker-line` (kept as a comma-selector alias
      since `ProfilePage.tsx`, out of scope here, still references the old name directly). Added the `dot-pulse-ring`
      keyframes for `.dot-connecting` (with an explicit `prefers-reduced-motion` override, mirroring
      `.hero-terminal-cursor`'s existing one). Extended the existing `.feature-card` cursor-spotlight mechanism
      (`--spot-x`/`--spot-y`, `::before` radial-gradient, `pointer: fine` gate, `> *` z-index companion rule) to
      `.dashboard-continue-live` and the new `.progress-summary-card`. Added the `@property --ring-pct` donut-ring
      rule (`.progress-ring`, `--sm`/`--lg` sizes) as a direct extension of the hero's `--border-angle` technique.
      Added `.category-tile` modeled on `.challenge-card` (not `.card`) and deliberately left out of the
      `--texture-grain` selector list, same reasoning that already excludes the challenge grid. Left the old,
      now-unused `.category-row` rule in place (grep confirms nothing references it, but deleting wasn't required).
- [x] Verified: `npx tsc --noEmit` and `npm run build` both clean — no CSS-minifier warnings (checked every new
      multi-line comment for an accidental `*/` sequence given a prior pass's exact bug of this shape). Grepped the
      built `dist/assets/index-*.css` directly and confirmed `.progress-ring`, `.category-tile`, `--ring-pct`,
      `.dashboard-continue-card-link`, `.badge-status-complete`, `.badge-status-progress`, `.kicker-line`, and
      `dot-pulse-ring` all landed in the real bundle. Brought the real stack up via `docker compose up --build -d`;
      `postgres` healthy, `GET /health` OK. Signed up a throwaway account and fetched `GET /api/progress` for real:
      50 challenges across the real 10 categories in the real fixed order — every category currently has
      `total > 0` in this seed data, so the `total === 0` empty-tile copy couldn't be exercised against a live
      response this time (verified by code reading instead; it's the path that renders if a category is ever added
      ahead of its challenges being seeded). Started a real session against `perm-config-blocks-service`, applied
      the actual fix (`chmod 755`/`644` to undo the seeded-broken permissions, then `service nginx start`) inside
      the live container as the unprivileged `trainee` user via `sudo`, and `POST /api/sessions/:id/check` passed
      for real. After stopping the session, re-fetched `GET /api/progress` and `GET /api/challenges`: both agree
      (`solved: 1`, `permissions-ownership` at `1/6`, the challenge itself `solved: true`) — confirming Dashboard
      and Progress still can't drift apart, since nothing in this pass touched the query layer. Deleted the
      throwaway account's row from `users` afterward; `docker ps -a --filter label=app=devops-trainer` was empty
      immediately after, confirming no orphaned session container. **No headless browser was available in this
      environment**, so the actual rendered feel (the ring fill-in animation, the spotlight glow on the two new
      dashboard cards, the category grid's small-multiples layout) was verified by reasoning through the CSS and
      confirming every new class/custom-property reached the real built bundle, not a screenshot — a real look in
      a browser is still worth the user doing, same caveat as every design pass before this one. Dev-override stack
      left running as the steady state.

## 2026-07-26 — Marketing page split, Dashboard/Challenges/Progress background washes, submission-only help feature
Three pieces of work in one pass, see `decisions/0022-*.md` for full rationale. Zero new npm dependencies; every
visual effect is hand-built CSS custom properties + inline SVG, same convention as every prior pass.
- [x] **Marketing page split.** `frontend/src/components/MarketingLayout.tsx` (new): `LandingNav` (its anchor links
      now real `<Link>`s to real routes, `scrollToId` removed) and `LandingFooter` promoted out of
      `LandingPage.tsx` verbatim into a shared wrapper. Four new pages under `frontend/src/pages/`:
      `FeaturesPage.tsx`, `HowItWorksPage.tsx`, `SelfHostingPage.tsx`, `FaqPage.tsx` — each lifts its section
      function + data array + only-used icons verbatim from the old `LandingPage.tsx`, wrapped in
      `MarketingLayout`, at new routes `/features`, `/how-it-works`, `/self-hosting`, `/faq` (`frontend/src/App.tsx`,
      same tier as the existing `/about` — outside `RequireAuth`, no auth-redirect logic). `LandingPage.tsx` itself
      now composes `<MarketingLayout><Hero /><StatsSection /><AboutNavCards /><FinalCta /></MarketingLayout>` — a
      new `AboutNavCards` section replaces the old in-page anchor sections with four `Link` cards
      (`.marketing-nav-card`) out to the split pages. `Hero`'s own separate `scrollToWalkthrough` anchor-scroll copy
      (distinct from `LandingNav`'s, easy to miss) was also replaced with a real `<Link to="/how-it-works">`.
- [x] **Background washes.** `styles.css`: new `.marketing-page-header` (+ 4 per-page modifier classes) gives the
      four split pages a static, low-alpha double-radial-gradient echo of the hero mesh where they now open
      straight into their heading with no hero above them. New `.dashboard-page`/`.challenges-page`/
      `.progress-page` `::before` washes (even quieter, also static, `z-index: -1` behind each page's own cards)
      give Dashboard/Challenges/Progress a shared quiet backdrop — `ChallengeListPage.tsx`/
      `ProgressDashboardPage.tsx` gained the `challenges-page`/`progress-page` classes (`DashboardPage.tsx` already
      had `dashboard-page`). `.marketing-nav-card` extends the existing `.feature-card` cursor-spotlight mechanism
      as its third instance. No per-category icon mapping anywhere, per `decisions/0021`.
- [x] **Help feature.** `backend/migrations/0003_help_requests.sql` (`help_requests`: id/user_id/subject/message/
      created_at, no status/role/admin column anywhere). `backend/src/services/help.service.ts` +
      `backend/src/routes/help.routes.ts` (rate-limited POST, keyed per-user, default 5/hour; GET returns only the
      caller's own rows), wired into `backend/src/index.ts` at `/api/help`. Frontend: `HelpRequest` type + two
      methods on `frontend/src/api/client.ts`'s `api` object, `useHelpRequests()`/`useSubmitHelpRequest()` in
      `frontend/src/api/queries.ts`, new `frontend/src/pages/HelpPage.tsx` (modeled on `ProfilePage.tsx`'s
      `ChangePasswordCard` pattern) at `/help` (inside `RequireAuth`, unlike the four marketing pages — this page
      shows the caller's own submissions). `DashboardPage.tsx` gained a `HelpIcon` and a 4th
      `dashboard-links-card` row linking to it. `styles.css`'s `.field input, .field select` rule (and its
      `:focus`/`.field-invalid` variants) extended to include `textarea`; new `.help-request-item` card style.
- [x] Verified: `npx tsc --noEmit` clean on both `frontend` and `backend`. `npm run build` clean, no CSS-minifier
      warnings; confirmed separate lazy chunks for `FeaturesPage`/`HowItWorksPage`/`SelfHostingPage`/`FaqPage`/
      `HelpPage` in `dist/assets/`. Grepped the built CSS and confirmed `.marketing-page-header`,
      `.marketing-nav-card`, `.help-request-item`, and the three pages' `:before` washes all landed in the real
      bundle. Grepped all of `frontend/src` for `scrollIntoView`/`getElementById` (zero matches outside `main.tsx`'s
      unrelated root-mount call) and for every old `href="#..."` anchor (zero matches) — both anchor-scroll copies
      confirmed gone, not just one. `git diff frontend/src/components/NavBar.tsx` does show a diff, but it's
      pre-existing uncommitted work from `decisions/0019`/`0020` (confirmed via the diff's content and the file's
      mtime, which predates this pass) — `NavBar.tsx` was never opened or edited in this pass. Full stack brought
      up via `docker compose up --build -d`; confirmed `0003_help_requests.sql` applied via `schema_migrations`.
      Signed up a throwaway account: `POST /api/help` returned `201` with a real row confirmed directly in Postgres
      via `psql`; `GET /api/help` listed it; a 5th/6th submission within the rate-limit window returned `429`. The
      four new marketing routes plus `/help`/`/about` were curled through the real production nginx path (a
      temporary `docker compose -f docker-compose.yml up --build -d`, excluding the dev override, to exercise the
      actual built `dist` + nginx image rather than the `:5173` dev server) and all returned `200` via the existing
      SPA fallback with zero nginx config changes — the dev-override stack was then restored as the steady state.
      Deleted the throwaway account afterward; its `help_requests` row count went 5 → 0, confirming `ON DELETE
      CASCADE`; `docker ps -a --filter label=app=devops-trainer` was empty throughout. **No headless browser was
      available in this environment**, so the actual rendered feel (the two new background washes, the marketing
      nav cards' spotlight glow, the textarea styling) was verified by reasoning through the CSS and confirming
      every new class/custom-property reached the real built bundle, not a screenshot — same caveat as every
      design pass before this one. Dev-override stack left running as the steady state.

## 2026-07-26 — Signature-device visual pass on the four split marketing pages
See `decisions/0023-*.md` for full rationale. Zero new npm dependencies, no new `:root` tokens — same
hand-built CSS/inline-SVG convention as every prior pass. Audited all four pages against the "one template
stretched four ways" problem first: How It Works (`.walkthrough-terminal*`) and FAQ (`.faq-item*`,
`<details>` + `kicker-prompt`) already had a real per-page signature device from an earlier pass and were left
untouched; Features and Self-hosting did not and are the actual work here.
- [x] **Features: colorized `ls -l` permission prefix.** `FeaturesPage.tsx`'s `FEATURES` array gained a `perm`
      field per card (`-rwxr-xr-x` for the two real executable scripts, `seed.sh`/`check.sh`; `-rw-r--r--` for
      the rest — TS source and JSON data files). Rendered character-by-character before the existing file-tab
      dot+filename so only the `x` bits pick up `--color-success` (new `.feature-card-tab-perm`/
      `-perm-x` in `styles.css`) — the same thing a colorized real `ls -l` does for executables. `aria-hidden`
      on the whole perm span; `flex-wrap` added to `.feature-card-tab` as a defensive mobile safety net.
- [x] **Self-hosting: real annotated `docker-compose.yml` excerpt.** `SelfHostingPage.tsx` gained a
      `ComposePanel` component replacing the old two-line `.code-block` setup-commands snippet. Shows a
      verified, verbatim excerpt of the real repo-root `docker-compose.yml` (postgres/backend/frontend
      services, `MAX_CONCURRENT_SESSIONS`, the `docker.sock`/`./challenges` mounts, `depends_on: condition:
      service_healthy`, the top-level `networks:`), explicitly labeled "excerpt" in its header badge rather
      than implying completeness. Four real `#` annotation comments explain the healthcheck/depends_on
      pairing, the docker-outside-of-docker socket mount, `MAX_CONCURRENT_SESSIONS` as the one real
      resource-guard value actually in this file, and a shortened copy of the real comment already in the file
      about the `devops-trainer-challenges` network. New `styles.css` classes: `.compose-panel`,
      `.compose-panel-badge`, `.compose-body`, `.compose-line`, `.compose-indent-1..4`, `.compose-key`,
      `.compose-value`, `.compose-comment`, `.compose-blank`, `.compose-panel-footer` (the latter reuses
      `.walkthrough-cmd` for the surviving setup commands). Reuses `.walkthrough-terminal-bar`/`-dot`/`-title`
      for the panel header instead of a fourth parallel chrome implementation; deliberately a light surface
      (unlike the dark `.hero-terminal`/old `.code-block`, which represent a live terminal session, not a
      source-file read) per `decisions/0017`'s existing dark-vs-light distinction. The now-unused `.code-block`
      rule was removed. `.self-host-card`'s two-column grid changed `align-items: center` → `start` to suit the
      much taller right column.
- [x] Verified: `npx tsc --noEmit` clean. `npm run build` clean, no CSS-minifier warnings. Grepped the built
      `dist/assets/index-*.css` and confirmed every new class above landed in the real bundle, and that
      `.code-block` is gone from it. Grepped the built `SelfHostingPage-*.js` chunk for `MAX_CONCURRENT_SESSIONS`,
      `/var/run/docker.sock`, and `service_healthy`, then re-grepped the real root `docker-compose.yml` for the
      same three strings one more time to confirm nothing drifted from the real file. Dev-override stack was
      already up from a prior pass (`docker compose ps` showed all three services `Up`/`Up (healthy)`);
      confirmed `GET /health` on :4000 and `GET /features`/`GET /self-hosting` on the :5173 dev server all
      returned `200` — no rebuild needed since the dev override bind-mounts `frontend/src` and Vite hot-reloads
      source edits directly. Left running as the steady state. **No headless browser was available in this
      environment**, so the actual rendered look (the permission-string color accent, the compose panel's line
      coloring/indentation/wrapping at narrow widths) was verified by reasoning through the exact CSS/markup and
      confirming every new class reached the real built bundle, not a screenshot — same caveat as every design
      pass before this one.

## 2026-07-26 — Arc.net-inspired craft-upgrade pass on the marketing/landing page family
See `decisions/0024-*.md` for full rationale. Scoped to the six marketing routes (`/`, `/about`,
`/features`, `/how-it-works`, `/self-hosting`, `/faq`) plus `MarketingLayout.tsx`; the authenticated
app (dashboard/challenges/progress) is an explicit follow-up pass, not touched here. Zero new npm
dependencies, zero new accent hues or typefaces — every existing `--color-*`/`--font-*` token kept
verbatim; every technique below is plain CSS reusing values already in `:root`.
- [x] **Gradient confidence.** `.hero-bg`'s three radial washes bumped 0.12/0.08/0.07 → 0.18/0.13/0.11;
      the four `.marketing-page-header--*` modifiers bumped ~0.05–0.09 → ~0.09–0.15 — both land in the
      requested 0.10–0.20 band, still ambient background atmosphere, not foreground. New
      `.gradient-heading` utility (two-tone `--color-text` → `--color-accent-hover`, clipped to text,
      `@supports`-gated with a plain-color fallback) applied to exactly one headline per page: the Hero
      H1 (`/`, `/about`) and each of `/features`/`/how-it-works`/`/self-hosting`/`/faq`'s own defining
      `<h2>` — never the secondary headings on the same pages (`AboutNavCards`/`FinalCta`). The
      `--border-angle` conic-gradient hover-ring was deliberately **not** extended to
      `.feature-card`/`.marketing-nav-card` — they already carry their own animated-pattern borrow (the
      spotlight glow), and a second one would give cards two animated affordances against the hero's
      one, inverting the intended "one signature moment" hierarchy.
- [x] **Modern cards.** `.marketing-nav-card` and `.self-host-card` gained the same genuine two-layer
      resting shadow `.feature-card`/`.compose-panel` already had (tight contact layer + soft ambient
      layer, reusing `--color-shadow-rgb`). Hover states on `.feature-card`/`.marketing-nav-card` (the
      only two cards with a hover interaction) unified onto one identical recipe — `translateY(-6px)
      scale(1.015)` + a shadow "bloom" — replacing `.marketing-nav-card`'s previously lighter,
      single-layer, translateY(-4px)-only hover. `prefers-reduced-motion`'s existing hover
      `transform: none` override list extended to include `.marketing-nav-card:hover`. Glassmorphism
      (`rgba(255, 255, 255, .78)` + `backdrop-filter: blur(16px) saturate(140%)`, the exact recipe
      `.auth-card`/`.landing-nav.condensed` already use) applied to exactly one card, `.self-host-card`
      — the only card that actually sits directly over a page's gradient-mesh wash
      (`.marketing-page-header--self-hosting`); every other card candidate sits on flat `--color-bg`
      and was deliberately left opaque, per the brief's own "skip it where there's nothing to show
      through" caveat. `.compose-panel` nested inside `.self-host-card` stays opaque too — different,
      non-glass register (reading a source file, not a floating surface).
- [x] **Typographic/rhythm confidence.** Hero H1's `clamp()` ceiling raised `3.75rem` → `4rem` (low end
      and `3.2vw` slope untouched). Vertical-rhythm audit found a real bug, not just a gap:
      `.final-cta-section`'s `padding-top: var(--space-7)` (specificity 0,1,0) had never actually
      applied at any viewport — `.landing .section` (0,2,0) always won that property outright. Fixed by
      renaming the selector to `.landing .final-cta-section` (matches the winning specificity) and
      standardizing its value on `--space-8` (the file's largest spacing token) at every breakpoint,
      not just >=860px. `.stats-grid`'s own tighter `--space-6` rhythm was deliberately left alone — a
      compact stat-band by design, not a "major section."
- [x] Verified: `npx tsc --noEmit` clean. `npm run build` clean, no CSS-minifier warnings. Grepped the
      built `dist/assets/index-*.css` and confirmed `.gradient-heading` (both rules), the bumped gradient
      alphas, the `4rem` clamp ceiling, `.marketing-nav-card`'s new resting shadow and unified `:hover`
      block (byte-identical to `.feature-card:hover`'s), `.self-host-card`'s glass properties, and
      `.landing .final-cta-section{padding-top:var(--space-8)}` all landed in the real bundle. Grepped
      the CSS diff for any hex/rgb literal not already an existing token — none found; `rgba(255, 255,
      255, 0.78)` is a byte-for-byte reuse of the value already used twice elsewhere in the file, not a
      new color. Dev-override stack was already up from a prior pass (`docker compose ps` showed all
      three services `Up`/`Up (healthy)`); `curl`/`wget` were unavailable in this environment, so
      confirmed `GET /`, `/about`, `/features`, `/how-it-works`, `/self-hosting`, `/faq` on the :5173 dev
      server and `GET /health` on :4000 all returned `200` via `node --eval` with `fetch` instead — no
      rebuild needed since the dev override bind-mounts `frontend/src` and Vite hot-reloads source edits
      directly. Left running as the steady state. **No headless browser was available in this
      environment**, so the actual rendered feel (gradient-text headlines, deepened ambient washes, card
      shadow bloom + slight scale on hover, the self-host card's glass effect against its page's
      gradient) was verified by reasoning through the exact CSS/markup and confirming every
      new/changed rule reached the real built bundle, not a screenshot — same caveat as every design
      pass before this one.

## Follow-up — gradient-heading contrast fix + self-hosting install panel (post-Phase 7)
- [x] **Gradient-heading fix**: the two-tone headline gradient used `--color-accent-hover` (#0b5d74),
      too close in luminance to near-black body text (~2.3:1 measured ratio) to read as a visible
      gradient at all — the actual cause behind "I can't see any changes," not browser caching. Switched
      to `--color-accent` (#0e7490, ~3.2:1 against text) — still zero new colors. `npm run build` clean.
- [x] **Self-hosting page — install panel replaces the docker-compose.yml excerpt**: per direct user
      request, swapped the annotated compose-file excerpt (`decisions/0023`) for a literal install
      script (`InstallPanel`) — clone the real repo (`github.com/Shouryabisht24/linux-incident-trainer`,
      confirmed via `git remote -v`, not guessed), `cd`, `.env` setup, `docker compose up --build`, plus
      a "View source on GitHub" button. Reused the existing terminal-chrome header and
      `.walkthrough-cmd` inline-command styling rather than a third parallel visual language; deleted
      the now-fully-unreferenced YAML-specific CSS classes rather than leaving them dead. See
      `decisions/0025-*.md`.
- [x] Verified: `npx tsc --noEmit`/`npm run build` clean; grepped built CSS for the new `.install-*`
      classes present and the old `.compose-key`/`.compose-line`/`.compose-indent-*` classes fully gone;
      grepped the built JS chunk for the literal GitHub URL; confirmed live via the dev server's HMR log
      and a `200` on `/self-hosting`.

## 2026-07-26 — Bold multi-hue gradient palette on the marketing pages (post-decisions/0024)
The prior Arc.net-inspired pass (`decisions/0024`) deliberately stayed teal-only per the user's own
instruction at the time; the user then reported "I can't see this" twice, and it was independently
confirmed this wasn't a caching/delivery bug — a single muted hue at low opacity against this app's
neutral light palette just doesn't register as an Arc-style change at a glance. Asked directly, the
user explicitly authorized new hues for gradient/glow purposes only: "Go bolder — real color, real
vividness... a real departure from the current restrained identity, not a tuning pass." See
`decisions/0026-*.md` for the full writeup.
- [x] **New decorative-only palette.** Two new tokens added to `:root` (plus paired `-rgb` channels):
      `--color-gradient-violet: #6d4aff` and `--color-gradient-rose: #c22a80`. Grounded in the same
      teal+violet+pink triad found in popular developer terminal/editor themes (Dracula, Tokyo Night,
      Catppuccin all pair a cyan/teal with a violet and a rose/magenta) — a genuine, subject-appropriate
      reference for a dev-tool audience, not arbitrary decoration. Both computed via the WCAG
      relative-luminance formula: violet is 5.15:1 against white / 3.37:1 against `--color-text`; rose
      is 5.33:1 against white / 3.26:1 against `--color-text` — both clear AA as real gradient-clipped
      text (not pastel), and both sit in the same ~3.2–3.4:1 band from `--color-text` that
      `--color-accent` itself does, deliberately avoiding the exact "too little luminance separation to
      read as a gradient" failure the prior pass's own contrast fix diagnosed. Explicitly scoped as
      decorative/gradient-only: buttons, links, nav, badges, and all existing semantic-color usage
      (`--color-accent`/`--color-success`/`--color-danger`/`--color-warning`) are untouched.
- [x] **Bolder, genuinely multi-hue washes.** `.hero-bg` reworked from an accent/success/warning triad
      at 0.11–0.18 alpha to a teal/violet/rose triad at 0.22–0.30 alpha. All four
      `.marketing-page-header--*` modifiers (`/features`, `/how-it-works`, `/self-hosting`, `/faq`) got
      their own 3-stop teal/violet/rose weighting and focal-point arrangement (features: teal-led;
      how-it-works: violet-led; self-hosting: rose-led; faq: violet-led/mirrored) so the four read as a
      cohesive but individually distinct family. `.gradient-heading` upgraded from a 2-stop
      text→accent gradient to a real 3-stop text→violet→rose progression. `.hero-terminal-frame`'s
      conic-gradient moving-border ring enriched from a two-hue accent/success sweep to
      teal→violet→rose (same single animation mechanism, no new technique added).
- [x] **Richer card hover glow.** `.feature-card`/`.marketing-nav-card`'s hover shadow-bloom now blends
      two of the three hues instead of accent-only, rotating by grid position
      (`:nth-child(3n+1)`=teal+violet, `:nth-child(3n+2)`=violet+rose, `:nth-child(3n)`=rose+teal) so a
      full card grid cycles through the whole triad on hover. `.marketing-nav-card` needed a
      `.marketing-nav-grid > *:nth-child(...) .marketing-nav-card:hover` selector form rather than a
      plain `:nth-child` on the card itself, since its `Reveal` wrapper sits between it and the grid
      (unlike `.feature-card`, whose `Reveal` renders the card element directly).
- [x] **Typography pushed further.** Hero H1 clamp ceiling `4rem`→`4.5rem` (slope `3.2vw`→`3.6vw`,
      floor untouched), tracking `-0.025em`→`-0.03em`. `.landing .section-head h2` (every
      page-defining gradient-heading `<h2>`) ceiling `2rem`→`2.35rem`, weight `700`→`800`. Computed
      sizes at 320/360/400px to confirm no mobile regression — new values land within ~1px of the old
      ones at those widths; all the real growth happens at >=768px.
- [x] Verified: `npx tsc --noEmit`/`npm run build` clean. Grepped `dist/assets/index-*.css` for both
      new hex values, both `-rgb` tokens, the 3-stop `.gradient-heading` gradient, the enriched
      `.hero-bg`/`.marketing-page-header--*` rules, and the `:nth-child` hover-glow overrides — all
      present verbatim. **Critical, given the repeated "I can't see it" reports**: curled the live
      `:5173` dev server's `/src/styles.css` directly (not just `dist/`) — `200`, `Cache-Control:
      no-cache`, fresh `Etag`/`Date` — and grepped that live response for the same tokens/rules,
      confirming the running dev-override stack is actually serving every change. Computed all
      contrast ratios via the WCAG relative-luminance formula (script, not eyeballed). `docker compose
      ps` showed all three services `Up`/`Up (healthy)`; curled all six marketing routes plus
      `:4000/health` — all `200`. No rebuild/restart needed (dev override bind-mounts `frontend/src`).
      Left running as the steady state. **No headless browser available in this environment** — same
      caveat as every prior visual pass — but given the magnitude of this change (a structurally
      different multi-hue palette at meaningfully higher alpha, not a tuning delta), this should read
      as unmistakable at a glance rather than needing the same "trust the reasoning" caveat as the more
      marginal prior pass.

## 2026-07-26 — Challenge-detail polish, authenticated gradient extension, milestone celebrations, real 404 (decisions/0027)
Four bundled frontend improvements. No backend changes, no new npm dependencies.
- [x] **Challenge-detail page visual polish.** `ChallengeDetailPage.tsx`/`TerminalPane.tsx` had zero
      design-pass attention while the marketing pages went through five rounds of it. New
      `.challenge-panel`/`.hint-card` classes bring the header/description, hint reveal, and solution
      card up to the same two-layer-shadow "modern card" language already used elsewhere
      (`.feature-card`/`.marketing-nav-card`/`.self-host-card`). A new `.challenge-detail-page::before`
      wash matches the mechanic used on Dashboard/Challenges/Progress but stays at the original,
      pre-boost alpha — deliberately the one restrained authenticated page, since it's a working tool a
      user stares at for 10-20 minutes, not a page to compete for attention. `.terminal-frame` wraps
      the chrome around `TerminalPane` (not xterm's own dark theme, which is untouched) in a slow,
      mostly-transparent conic-gradient ring reusing the hero terminal's `--border-angle` mechanism,
      toned way down (42s spin vs. the hero's 7s). The check-result banner's `✅`/`❌` emoji were
      replaced with hand-drawn stroke-glyph icons, matching every other icon in the app.
- [x] **Bold gradient palette extended to Dashboard/Challenges/Progress.** decisions/0026's
      violet/rose palette had only reached the six marketing routes; `.dashboard-page`/
      `.challenges-page`/`.progress-page::before` were still on the original decisions/0021 restrained
      single-hue pairing. Bumped all three to the same ~0.10-0.22 alpha band the marketing pages use,
      keeping each page's existing semantic lead hue (accent/warning/success) and layering in a
      distinct violet/rose focal-point arrangement per page so the three stay distinguishable from each
      other and from the marketing family. Added `.gradient-heading` to exactly one heading per page
      (Dashboard's "Welcome back", Challenges' "Challenges", Progress's "Your solve record"), matching
      the marketing pages' "one gradient headline per page" rule.
- [x] **Milestone celebrations — first solve, category complete.** Purely client-side detection off
      existing `useProgress()` data, no new backend endpoint/column: a progress snapshot is taken right
      before "Check my fix" fires, compared against a freshly `refetch()`'d snapshot once a check
      passes. New `components/Celebration.tsx` — a dismissible, non-blocking, fixed-top banner (not a
      toast, not a modal) with a hand-drawn icon, an animated ring reusing the `--border-angle`
      mechanism, and plain-voice copy distinct per trigger. Auto-dismisses after 6s or on manual close.
      Kept deliberately separate from `ToastContext` rather than added as a new toast kind — see
      decisions/0027 for the full reasoning.
- [x] **Real 404 page.** Replaced the silent `<Navigate to="/" replace />` catch-all with
      `pages/NotFoundPage.tsx` — a `systemctl status`/`curl` transcript joke reusing the existing dark
      `.hero-terminal` chrome, sitting outside `<RequireAuth>` (same tier as `/about`), with a CTA that
      branches on `useAuth()` exactly like the marketing pages' own auth-branched CTAs.
- [x] Verified: `npx tsc --noEmit`/`npm run build` clean, no CSS-minifier warnings. Grepped both the
      built CSS and a live `curl` of the running `:5173` dev server for every new class/component name —
      present in both. Curled `/some-nonexistent-route` — `200`, SPA shell served correctly.
      **Functionally exercised the celebration logic against the real API and real challenge
      containers**: signed up a throwaway account, solved `perm-config-unreadable-by-app` via a real
      `docker exec` fix and confirmed `GET /api/progress` went `0 -> 1` solved (first-solve condition),
      confirmed a recheck did not re-trigger, then solved the remaining five
      `permissions-ownership` challenges one at a time via real fixes and confirmed the sixth's
      before/after (`5/6 -> 6/6`) correctly identifies as category-complete and is distinguishable from
      first-solve, and confirmed a fresh recheck of the now-complete category does not re-fire. Cleaned
      up every test session/container and deleted the throwaway account row via `psql` (no self-service
      delete-account endpoint exists). `docker compose ps` showed all three services running throughout,
      left as the steady state, no rebuild needed (dev-override bind-mounts `frontend/src`). **No
      headless browser available in this environment** — leaned on live dev-server response grepping and
      driving the real API/containers for the one part (celebrations) with actual conditional logic,
      rather than relying on code-reading alone.

## 2026-07-27 — Terminal reliability pass: exec persistence, backpressure, ping/pong, auto-reconnect (decisions/0028)
The core reliability gap in the app's core feature: every WebSocket (re)connect spun up a brand-new `bash -l`
exec, losing cwd/env/history on any reconnect even though the container itself never stopped. Fixed end to end,
backend and frontend. See decisions/0028 for full numeric reasoning.
- [x] **Exec-session registry, keyed by `containerId`** (`docker.service.ts`): `attachOrCreateShell`/
      `releaseSocket`/`endShellSession` + an `execRegistry` map. A reconnect now attaches to the *same* exec
      instead of creating a new one — `data`/`end`/`error` are wired exactly once per exec (moved out of
      `terminalSocket.ts`'s per-connection wiring) and fan out to a `Set<WebSocket>` of attached sockets
      (mirrored-terminal policy for concurrent connections — decisions/0028). A 120s grace timer tears down the
      exec only if every socket detaches and none reconnects in time. `endShellSession` is now the literal first
      line of `destroyContainer`, so all five existing container-teardown call sites
      (`stopSession`/idle-reaper's two branches/`drainAllActiveSessions`/`reconcileOrphans`) get correct exec
      cleanup for free.
- [x] **Backpressure** in the exec registry's `data` handler: pauses the dockerode exec stream once any attached
      socket's `bufferedAmount` exceeds 4 MiB, resumes only once all attached sockets drain below 1 MiB.
- [x] **WS heartbeat** (`terminalSocket.ts`): 30s ping/pong sweep, `terminate()`s unresponsive peers;
      `maxPayload: 1 MiB` on the WS server; per-connection `ws.on("error", ...)` logging (previously silent);
      exec stream errors now logged via `logger.error` (previously silently swallowed).
  and defensive `endShellSession` call added where `bridge()`'s existing `isContainerAlive` check fails.
- [x] **Frontend structural split** (`TerminalPane.tsx`): the old single `[wsTicket]`-keyed effect (which
      recreated the `Terminal` object itself on every reconnect) is now two effects — a mount-once effect owning
      `Terminal`/`FitAddon`/`ResizeObserver`, and a `[wsTicket]`-keyed effect owning only the `WebSocket`. A
      reconnect now preserves scrollback and the on-screen buffer instead of throwing them away, matching the
      real continuity the backend now offers.
- [x] **Bounded auto-reconnect** (`ChallengeDetailPage.tsx`): 5 attempts / ~23s total budget
      (`[1s, 2s, 4s, 8s, 8s]`) on an unexpected disconnect, re-checking `stoppingRef` both before scheduling and
      inside the retry callback so a stop landing mid-backoff can never race it. Falls back to the existing
      "Terminal connection lost" toast + manual Reconnect button, unchanged, once exhausted. Resets the attempt
      counter on a successful reconnect.
- [x] **Polish**: xterm theme now built from this app's own `--term-mock-*` tokens (previously xterm's own
      generic default palette); `scrollback: 10000` (was xterm's default 1000); a coarse-pointer-only touch key
      row (Esc/Tab/Ctrl+C/D/Z/L/arrows + a one-shot Ctrl-arm-next-letter modifier) wired through `term.input()` —
      the same pipeline real keystrokes already use, so it can never drift from actual input handling.
- [x] Verified against the real running stack, both transport paths (dev-override `:4000`/`:5173` and the
      production nginx path via `docker compose -f docker-compose.yml up --build -d` on `:3000`) — see
      decisions/0028 for full detail. Highlights: a real non-graceful drop (`ws.terminate()`, confirmed close
      code `1006`, not a clean `1000`) followed by a real reconnect preserved `pwd`, an exported env var, and
      shell history, with the `[reconnected — shell session resumed]` banner, on **both** paths. Backpressure:
      backend container RSS stayed flat (~68-76 MiB) while a client paused its own socket read for ~15s during a
      75MB burst, then received the full burst once resumed. Ping/pong: 3 pings at ~30.0s spacing over a 90s idle
      connection, no spurious disconnect. Idle reaper and graceful shutdown (production image) both regression-
      checked live — no crash, no hang, correct container/session cleanup in both cases. Encountered and worked
      around a pre-existing, unrelated, uncommitted WIP password-reset feature in the working tree that was
      missing its `nodemailer` dependency and crash-looping the backend regardless of this pass's changes —
      `git stash`'d it (untracked files included) for the duration of verification, confirmed `backend`'s own
      `npx tsc --noEmit` was clean once set aside, then `git stash pop`'d it back exactly as found afterward; it
      was already broken before this pass started and is unrelated to the terminal work, so left untouched
      rather than fixed (installing the missing dependency was attempted and declined by the permission system).
      **No headless browser available in this environment** — the frontend auto-reconnect state machine's exact
      timing, the toast-fallback-after-5-attempts behavior, and stop-suppression were verified by careful code
      reading only, not a live browser session; everything they depend on backend-side (ticket issuance, WS
      reconnect, shell resumption) was verified live. Cleaned up every throwaway account/session/container.
      Left the dev-override stack running as the steady state.

## 2026-07-27 — Forgot/reset-password, self-service account deletion, command palette, visual refresh (decisions/0029)
Wired up the previously-scoped-but-unwired password-reset service functions and mail service, added
self-service account deletion, a Cmd+K command palette, and a visual-consistency pass over the auth/profile/
toast surfaces. See decisions/0029 for full reasoning.
- [x] **Forgot/reset-password** (`auth.routes.ts`): `POST /forgot-password` (always `200 {ok:true}`, no
      enumeration regardless of internal outcome) and `POST /reset-password` (one generic 400 for every
      failure mode — no match, already used, expired), each behind its own rate limiter
      (`forgotPasswordLimiter` keyed `ip:email`, `resetPasswordLimiter` keyed by IP alone). Root `.env.example`,
      `docker-compose.yml`'s `backend` env allowlist, and the README config table all updated for
      `SMTP_*`/`FRONTEND_URL`. Frontend: `client.ts`/`queries.ts` gained `requestPasswordReset`/`resetPassword`;
      new `ForgotPasswordPage.tsx`/`ResetPasswordPage.tsx` (public routes, same tier as `/about`, lazy-loaded in
      `App.tsx`); `AuthForm.tsx` gained a "Forgot password?" link (login view only).
- [x] **Self-service account deletion**: `DELETE /api/auth/me` (`requireAuth` + `deleteAccountLimiter` keyed by
      `req.userId`, body `{currentPassword}`, generic 400 on mismatch, `200 {ok:true}` on success — calls the
      already-existing `deleteOwnAccount`, which stops any active session/container first so the DB cascade
      alone can't orphan a running container). Frontend: `useDeleteAccount()` hook; `ProfilePage.tsx` gained a
      new `DeleteAccountCard` — disabled until both the literal word `DELETE` is typed and the current password
      is entered, `.btn-danger` (existing class, not reinvented), unambiguous irreversibility copy.
- [x] **Command palette** (Cmd+K, zero new dependencies): new `CommandPalette.tsx`, mounted once inside
      `RequireAuth.tsx` (single global keydown listener there, no new Context). ARIA combobox-listbox pattern —
      DOM focus stays on the text input, `aria-activedescendant` tracks the highlighted `role="option"` row —
      deliberately distinct from `ChallengeListPage`'s `ChipGroup` roving-tabindex pattern, which fits a small
      fixed option set rather than a live-filtered search list. Filters static nav actions, every real challenge
      (via `useChallenges()`), and "Log out" by plain substring match, same idiom as the existing challenge
      search. New `.cmdk-*` CSS reusing the `.feature-card` shadow recipe.
- [x] **Visual refresh**: `.auth-card`/`.profile-card` (newly shadowed, scoped — not the shared `.card` base)
      and the command palette panel all reuse `.feature-card`'s exact two-layer shadow. `.auth-page` gained a
      third, restrained violet wash stop; new `.profile-page::before` ambient wash (violet-leading, a hue none
      of the dashboard/challenges/progress trio led with yet) plus `.profile-danger-card` (danger-bordered
      variant of `.profile-card`). `.gradient-heading` applied to the `AuthForm`/`ProfilePage` headings. Toast
      system: `.feature-card`-style shadow, a per-kind colored left-border accent, and a small stroke-glyph icon
      chip (same `iconProps()` convention as `DashboardPage.tsx`) — `.toast-in`'s `160ms ease-out` timing left
      untouched, only static treatment changed.
- [x] Verified: `backend`/`frontend` `npx tsc --noEmit` and `npm run build` both clean, no CSS-minifier warnings.
      Curled the live `:5173` dev server directly for new files (`ForgotPasswordPage.tsx`, `CommandPalette.tsx`)
      and confirmed it serves the actual new source via Vite HMR, not a stale build. `docker compose up --build
      -d` (rebuild needed — the backend's compose env allowlist changed); all three services healthy; backend
      boot log shows the expected `SMTP_HOST is not set` warning with no crash. **Forgot/reset-password, fully
      exercised against the real API + real `psql`**: signed up a throwaway account, confirmed identical
      `200 {ok:true}` for both its real email and a nonexistent one, pulled the real plaintext token from the
      backend's log line (SMTP unset in this environment), confirmed the DB stores only a SHA-256 hash,
      completed a real reset, confirmed the old password now fails login and the new one works, confirmed
      replaying the same token fails (single-use), confirmed a `psql`-back-dated-`expires_at` token also fails.
      Confirmed both `forgotPasswordLimiter` (5/window) and `resetPasswordLimiter` (10/window) trip correctly.
      **Account deletion, fully exercised**: created a throwaway account with a real session, check attempt,
      revealed hint, help request, and reset-token row each; confirmed a wrong-password delete is rejected;
      deleted with the correct password; confirmed every related row count (`sessions`/`progress`/
      `check_attempts`/`help_requests`/`password_reset_tokens`) went from 1 to 0 in one query; confirmed the
      session's actual Docker container (not just its DB row) was destroyed; confirmed login afterward fails;
      confirmed `deleteAccountLimiter` (5/window) trips correctly. Cleaned up every throwaway account/session/
      container created during verification — confirmed zero `throwaway-%` users and zero orphan
      `app=devops-trainer` containers remain. **No headless browser available in this environment** — the
      command palette's actual keyboard interaction (focus trap, `aria-activedescendant` wiring, arrow-key
      wraparound) and all six visual-redesign pieces were verified by careful code reading only, stated here
      honestly rather than implied as browser-verified. Left the dev-override stack running as the steady
      state.

## 2026-07-28 — Hand-built micro-interactions on authenticated pages: tilt, magnetic buttons, shiny-text, click-spark (decisions/0030)
React Bits-inspired ("UI Elements": tilt cards, magnetic buttons, shiny text, click sparks), translated entirely
into hand-built CSS/JS — zero new npm dependencies. See decisions/0030 for full reasoning, especially the
transform-collision-avoidance technique this pass depended on.
- [x] **Tilt-on-hover** (`--tilt-x`/`--tilt-y`, set from a `pointermove` handler, consumed only inside each
      element's *existing* `:hover`/`:focus-visible` transform — never a new resting-state rule, to avoid
      colliding with `.reveal`'s own mount-time transform): `.challenge-card` (`ChallengeListPage.tsx`, also
      covers `DashboardPage.tsx`'s `RecommendedSection` by class reuse), `.dashboard-continue-live` /
      `.dashboard-progress-card` (`DashboardPage.tsx`, combined into the existing `handleSpotlightMove` rather
      than a second `onPointerMove`), `.profile-card`/`.profile-danger-card` (`ProfilePage.tsx`, all three
      cards). `.category-tile` deliberately left untouched (decisions/0021 — non-interactive by design).
- [x] **Magnetic-pull hover** (`--magnet-x`/`--magnet-y`, capped ±6px, same in-place-extension technique):
      `.btn-primary` on Save display name / Change password (`ProfilePage.tsx`) and Start Challenge / Check My
      Fix (`ChallengeDetailPage.tsx`); `.btn-danger` on the delete-account button (`ProfilePage.tsx`).
- [x] **Shiny-text sweep** (`.count-shine`/`.text-shine`, `@supports`-gated background-clip trick, same
      fallback-safety pattern as `.gradient-heading`): the solved-count span in `DashboardPage.tsx`'s
      `ProgressSnapshotCard` and `ProgressDashboardPage.tsx`'s summary card, plus `Celebration.tsx`'s milestone
      title. Deliberately scoped to just these — not every `.tabular` number in the app.
- [x] **Click-spark** (hand-built DOM+CSS burst, no canvas): only `ChallengeDetailPage.tsx`'s "Start Challenge"
      and "Check My Fix" buttons, gated by `useReducedMotion()` directly in JS before any DOM node is created.
- [x] Verified: `npx tsc --noEmit` and `npm run build` both clean, no CSS-minifier warnings. Grepped the built
      `dist/assets/index-*.css` for `.count-shine`, `@keyframes count-shine`, `.click-spark`,
      `@keyframes click-spark-burst`, `.btn-spark-host`, and every extended hover transform — all present.
      Curled the live `:5173` dev server for every changed file and grepped the response bodies for the new
      identifiers, confirming Vite serves the real edits. Specifically re-grepped every `transform:` line in
      `styles.css` afterward and traced each to its enclosing selector — confirmed none is a new bare
      resting-state rule; every one sits inside an existing `:hover`/`:hover:not(:disabled)` rule. Confirmed
      `.category-tile` and the Dashboard/Challenges/Progress ambient `::before` washes were not touched.
      `docker compose ps` — all three services healthy; no backend changes, no rebuild needed. **No headless
      browser available in this environment** — the actual rendered feel (tilt angle, magnet responsiveness,
      the shiny-text sweep's timing, the click-spark burst) was verified by careful reading of the exact
      CSS/JS, not a visual check. Left the dev-override stack running as the steady state.

## 2026-07-28 — About page animation-intensity pass: same techniques, made unmistakably more present (decisions/0031)
User asked for "cool animations" on the About page again despite the existing hero reveal/mesh drift/border ring/
spotlight cards/count-up all already being real work; explicitly chose "bolder version of existing techniques" over
something new. Same restraint-then-escalate pattern this project has hit repeatedly (decisions/0024, 0026) — every
change below is a numeric bump on a rule that already existed, zero new animation mechanisms. See decisions/0031 for
full before/after numbers and reasoning.
- [x] `.hero-bg` mesh drift: `28s` → `12s` cycle; keyframe movement `translate3d(-1.5%, 1%, 0) scale(1.02)` →
      `translate3d(-4%, 2.5%, 0) scale(1.06)`; gradient-stop alphas `0.3/0.26/0.22/0.05` → `0.44/0.4/0.36/0.09`.
- [x] `.hero-terminal-frame`'s `--border-angle` ring: `7s` → `3.5s` spin; transparent gap narrowed `50%-60%` →
      `52%-56%`; stop opacities `0.75/0.6/0.5` → `0.92/0.78/0.68`.
- [x] `AboutNavCards`' spotlight glow (`.marketing-nav-card::before`): `360px`/`0.13` → `520px`/`0.24`, added as a
      scoped override rule (not an in-place edit) so the shared `.feature-card`/`.dashboard-*` selectors this rule
      is also declared on stay at their original values — `/features` and the authenticated Dashboard are out of
      scope for this pass.
- [x] Hero character-by-character reveal (`HERO_REVEAL_MS_PER_CHAR`, `LandingPage.tsx`): `6ms` → `14ms` per char
      (~2.8s → ~6.6s total for the 470-character transcript) — at 6ms/char ~18 characters were mid-fade at once,
      reading as a blurred wipe rather than a perceivable typing cadence.
- [x] Stat tile count-up (`StatTile`, `LandingPage.tsx`): base duration `1200ms` → `2200ms` (stagger offset
      unchanged) — `easeOutQuint`'s front-loaded curve meant 1200ms mostly finished within a few hundred ms.
- [x] Verified: `npx tsc --noEmit` and `npm run build` both clean, no CSS-minifier warnings. Curled the live
      `:5173` dev server for `styles.css` and `LandingPage.tsx` and grepped for every new numeric value — confirms
      Vite serves the real edits. Grepped the built `dist/assets/index-*.css`/`LandingPage-*.js` and confirmed every
      value landed in the production bundle, including the minified count-up literal `2200+r` and the ring/mesh
      timing values. Confirmed the shared spotlight-glow rule still shows `.feature-card`/`.dashboard-*` at their
      original `360px`/`0.13`, immediately followed by the new `.marketing-nav-card`-only `520px`/`0.24` override —
      the scoping held rather than silently overwriting the shared rule. Re-read the reduced-motion block at the
      end of `styles.css` line by line and confirmed every touched effect is still frozen (`.hero-bg`'s explicit
      `animation: none`, `.hero-char`'s forced opacity/no-transition, and the blanket
      `animation-duration: .001ms !important` catch-all covering the now-faster ring spin) — no new gap introduced.
      `docker compose ps` — all three services healthy; no backend changes, no rebuild needed. **No headless
      browser available in this environment** — the actual rendered feel of the faster drift/ring, the wider/
      brighter spotlight, and the retimed typing/count-up effects was verified by careful reading of the exact
      CSS/JS values and the arithmetic behind them, not a visual check. Left the dev-override stack running as the
      steady state.

## 2026-07-30 — `styles.css` dead-code cleanup pass (decisions/0032)
`styles.css` had grown to 3940 lines across ~15 additive design passes; several of those explicitly left old rules
in place when a component was redesigned ("deleting isn't required, nothing else references it" — see the
`.category-row` note earlier in this file, and `.code-block`, already removed in decisions/0025). Went through
every selector in the file and cross-referenced it against the real `frontend/src/` tree by grepping the bare class
name as a substring — not just exact `className="foo"` matches — since this codebase builds many class names via
template literals (`` `dot dot-${terminalStatus}` ``, `` `toast toast-${t.kind}` ``, `` `progress-ring progress-ring--${size}` ``,
`` `chip${checked ? " chip-active" : ""}` ``). A naive exact-string grep would have wrongly flagged several of
those (`.dot-connected`/`.dot-connecting`/`.dot-disconnected`, `.toast-error`/`.toast-info`/`.toast-success`,
`.progress-ring--sm`/`.progress-ring--lg`) as dead; each was individually traced to the component prop/state type
that actually supplies the suffix (`TerminalStatus`, `ToastKind`, `size: "sm" | "lg"`) and confirmed live.
- [x] Removed `.category-row` + `.category-row:last-child` + its `@media (max-width: 640px)` override (the
      rule confirmed already-unused per this file's own history) — superseded by `.category-tile` from the
      Progress dashboard's decisions/0021 restructure; zero references anywhere in `frontend/src/`.
- [x] Removed `.progress-summary` + `.progress-summary .big` (~11 lines) — found via the systematic sweep, not on
      the known-candidate list. This was the pre-restructure flat "one h1 + stacked rows" Progress dashboard
      layout's own top-level rule, superseded by `.progress-summary-card`/`.progress-summary-stats`/`-primary`/
      `-secondary` (the hero-card layout from decisions/0021's "restructured from the original flat... layout").
      `.big` doesn't appear anywhere in any `.tsx`/`.ts` file, not even inside an unrelated word — confirmed with a
      plain, unbounded substring grep across the whole tree, not just an exact-className check.
- [x] Removed `.terminal-wrap-inner` (5 lines) — `TerminalPane.tsx` renders its xterm container with a plain
      inline `style={{ height: "100%", width: "100%", ... }}` object, never this class; `.terminal-wrap` itself
      (the outer chrome) is still very much alive and untouched.
- [x] Confirmed `.code-block` (the other seed candidate from the task brief) is not actually present in
      `styles.css` at all anymore — decisions/0025 already deleted it along with its YAML-specific siblings
      (`.compose-key`/`-value`/`-line`/`-indent-*`/`-panel-badge`) when `InstallPanel` replaced `ComposePanel`.
      Nothing left to remove there.
- [x] Checked every `@keyframes` block (14 total) against the file's own `animation:`/`animation-name:`
      properties — all 14 are referenced at least once, no orphans.
- [x] Checked every `:root` custom property against `var(--x)` usage in `styles.css` and inline styles/JS in
      `.tsx` files — all in use, including `--term-mock-warning` (zero `var()` refs inside `styles.css` itself,
      but consumed via inline `style={{ background: "var(--term-mock-warning)" }}` in `LandingPage.tsx`/
      `NotFoundPage.tsx` and via a `token("--term-mock-warning")` JS helper in `TerminalPane.tsx`). Per the task's
      explicit instruction, left every `--color-*`/`--font-*`/`--space-*`/`--radius-*` design token untouched
      regardless of how lightly any individual one is used — that token system is out of scope for a
      dead-code-only pass.
- [x] Kept (considered, did not remove): nothing else met the bar. Every other selector that looked like a
      candidate at a glance (`.hero` bare, `.dashboard-continue-card` bare, `.chip` bare, `.dot` bare,
      `.toast` bare, `.select-field` bare, `.dashboard-card-kicker` alongside `.kicker-line`) turned out to have a
      real, direct caller once traced individually — logged here so a future pass doesn't re-litigate them from
      scratch.
- [x] Verified: `npx tsc --noEmit` clean. `npm run build` clean, no CSS-minifier warnings. Built CSS bundle:
      `index-*.css` 60,710 → 60,186 bytes (−524 bytes); `ChallengeDetailPage-*.css` unchanged at 4,150 bytes (none
      of the three removed rules lived in that split chunk). Curled the live `:5173` dev server's
      `/src/styles.css` module and grepped it for `category-row`, `terminal-wrap-inner`, and a bare
      `.progress-summary {` — zero matches in all three, confirming Vite serves the real edit, not just a local
      file change — while `progress-summary-card`, `category-tile`, and `terminal-touch-row` (all still-live
      selectors) remained present. Re-ran the substring grep for every removed selector across `frontend/src/`
      one more time after all edits landed — still zero matches outside the git history, and re-confirmed no
      keyframe or `:root` token was orphaned as a side effect of these three removals (none of the three used a
      keyframe; all their custom-property references were core `--space-*`/`--color-*` tokens still used
      everywhere else). `docker compose ps` — all three services healthy; no backend changes, no rebuild needed.
      Left the dev-override stack running as the steady state.

## 2026-07-30 — Frontend test infrastructure: Vitest + Testing Library (decisions/0033)
First automated tests in this project's history — everything up to this point was verified manually (reading
code, curling endpoints, "no headless browser available in this environment"). Added `vitest`,
`@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as **dev-only** dependencies (the project's
zero-new-dependencies rule has always meant runtime deps for hand-built UI, never test tooling — confirmed via
`npm run build` + grepping `dist/assets/` for `test`, zero matches). Config lives in a standalone
`frontend/vitest.config.ts` (simpler than merging into the production `vite.config.ts`, whose `build`/`server`
blocks are irrelevant to a jsdom run) plus `frontend/src/test/setup.ts` (stubs `window.matchMedia`, which jsdom
doesn't implement at all and every `useReducedMotion`-dependent hook needs; wires `@testing-library/react`'s
`afterEach(cleanup)` explicitly since `globals` is off). Added `"test": "vitest run"` to `package.json`.
- [x] `useNoSpaceField` (`src/hooks/useNoSpaceField.test.tsx`) — all three whitespace-blocking paths exercised
      via real DOM events (`fireEvent.keyDown`/`.paste`/`.change` against a rendered controlled `<input>`): typed
      space blocked (keydown `preventDefault`), pasted text with embedded whitespace stripped in-place (caret
      position preserved), programmatic `change` backstop. Plus `stripWhitespace` directly.
- [x] `useCountUp` (`src/hooks/useCountUp.test.ts`) — `requestAnimationFrame`/`performance.now()` fully mocked
      for deterministic assertions: eases (confirmed non-linear via the exact `easeOutQuint` formula) from 0 to
      target once `start` flips true; confirmed the *actual* mount-time contract — `start` already `true` at
      mount does **not** jump straight to target (the initial `useState` seed only checks `reducedMotion`, not
      `start`) — and that reduced motion returns target immediately with zero frames scheduled.
- [x] `useScrollReveal` (`src/hooks/useScrollReveal.test.tsx`) — `IntersectionObserver` mocked per-file (not
      globally, so only this hook's test exercises it) with a class capturing the constructor callback +
      instance/disconnect counts. `visible` starts `false`, flips `true` and disconnects (once) on a
      manually-invoked intersecting callback, stays `false` on non-intersecting, resolves `true` immediately for
      reduced motion without ever instantiating an observer.
- [x] `CommandPalette`'s inline substring filter extracted to an exported pure function,
      `filterActions(actions, query)` (`src/components/CommandPalette.tsx`) — same logic, same call site via
      `useMemo`, a behavior-preserving extraction, not a refactor. Tested directly (`.test.ts`): empty/whitespace
      query, case-insensitivity, trimming, no-match, order preservation.
- [x] `ChallengeDetailPage`'s `detectCelebration`/`snapshotProgress` — already pure, just not exported; added
      `export` (no logic change). Tested (`.test.ts`): missing/undefined progress data, first-solve detection,
      category-complete detection, neither firing on a re-check of an already-solved challenge, category-complete
      correctly gated on having been incomplete *before* the check, and the real tie-break (first-solve wins when
      both conditions hold in the same check, since the implementation returns on that branch first).
- [x] Verified: `npx tsc --noEmit` clean. `npm test` — 5 files, 28 tests, all passing. `npm run build` — deleted
      the stale `dist/` first, fresh build clean, chunk layout/sizes unchanged from before this pass, confirmed
      no `*.test.*` file made it into `dist/assets/`.
- [x] **Scope note, unchanged from every prior visual pass**: this is jsdom (a simulated DOM in Node), not a real
      browser — no Playwright/Cypress added, per the task's explicit constraint. Real click coordinates, actual
      CSS layout/paint, and the many hand-built gradient/animation/micro-interaction passes tracked earlier in
      this file remain unverified by automated means; "no headless browser available in this environment" still
      holds exactly as it always has. This pass covers hook/pure-function logic, not visual correctness.

## 2026-07-30 — Backend test infrastructure (Vitest) + auth security review (decisions/0034)
First automated backend tests in this project's history — same "everything manual until now" starting point as
the frontend test-infra pass above, but for `backend/`. Added `vitest` (`^3.0.0`, resolved `3.2.7`) as a dev-only
dependency plus `"test"`/`"test:watch"`/`"test:integration"` scripts — same "dev tooling, not a runtime dep" carve-
out as the frontend pass. Paired with a focused security review of the auth surface added in decisions/0029, per
explicit request: found and fixed one real, concrete gap (password change/reset didn't invalidate already-issued
JWTs) and one real, concrete gap in a different code path than the one initially suspected (account-deletion error
handling could silently orphan a container on a Docker failure, rather than the ordering itself being wrong — the
ordering was already correct). Full trace/reasoning/before-after in decisions/0034.
- [x] `backend/test/unit/rateLimit.test.ts` — the `rateLimit()` fixed-window factory, fully in-memory/pure: allows
      up to `max` within the window, blocks `max+1` (with `Retry-After` set), keeps blocking further requests in
      the same window, resets after the window elapses (vitest fake timers), independent buckets per `keyFn` key.
- [x] `backend/test/unit/auth.service.test.ts` — `hashPassword`/`verifyPassword` (new, thin bcrypt wrappers
      extracted from three duplicated inline `bcrypt.hash`/`bcrypt.compare` call sites — behavior-preserving,
      same rounds/algorithm, now reusable and directly testable) round-trip correctly and reject wrong passwords;
      `hashResetToken` (newly `export`ed, no logic change) is a deterministic sha256 hex digest; `signAuthToken`/
      `verifyAuthToken` cover signature validation, expiry, wrong token `type`, missing user, and both directions
      of the new password-change-invalidation check (below) — `verifyAuthToken` now does one DB read, so its unit
      tests mock `../db/pool.js` to stay fast/isolated while still exercising the real logic.
- [x] `backend/test/unit/docker.service.test.ts` — `imageTag` (newly `export`ed, tag format incl. content-version
      bump) and `isNotModifiedOrMissing` (newly `export`ed) — writing this test caught a real bug: the latter
      threw a `TypeError` on a `null`/non-object input instead of returning `false`, so `destroyContainer`'s catch
      block could throw an unrelated error instead of the real container-removal failure it was classifying. Fixed
      with a type guard; a test now locks in `null`/`{}`/plain-`Error` all returning `false`.
- [x] `backend/test/integration/auth.integration.test.ts` — hits the **real** Postgres this repo's docker-compose
      stack runs (`signup`/`login`/`changePassword`/`resetPasswordWithToken`/`getUserById`), since these can't be
      meaningfully tested without one. Postgres has no host-exposed port by design (`internal`-only network per
      `docker-compose.yml`), so this suite runs inside the backend container instead, where `DATABASE_URL` already
      resolves: `docker compose exec backend npm run test:integration`. `docker-compose.override.yml` now also
      bind-mounts `./backend/test` and `./backend/vitest.config.ts` (dev-only, alongside the existing `src`/
      `package.json`/`tsconfig.json` mounts) so these files are visible in the container without a rebuild per
      edit. Every row created is deleted in `afterEach`/`afterAll` — verified zero leftover rows after a real run.
- [x] **Security finding 1 (real, fixed) — password change/reset didn't invalidate already-issued JWTs.** Auth
      tokens are stateless (`jsonwebtoken`, 7-day expiry, no revocation list); before this fix, `verifyAuthToken`
      checked only signature/expiry/type, so a stolen-but-unexpired token kept working for up to 7 days after the
      legitimate user changed their password specifically because they suspected compromise — a real, no-benefit
      security gap. Fixed with the smallest reasonable shape: migration `0005_password_changed_at.sql` adds a
      nullable `users.password_changed_at` (`NULL` = never changed, unchanged behavior); `changePassword` and
      `resetPasswordWithToken` now stamp it to `now()` in the same `UPDATE` as the password-hash change;
      `verifyAuthToken` (now `async`) rejects any token whose `iat` claim predates it; `requireAuth` awaits the
      now-async call. Tradeoff noted explicitly in decisions/0034: this adds one DB read per authenticated
      request, negligible for this project's single-node personal-tool scale, same "correctness over shaving a
      query" tradeoff already made elsewhere in this codebase.
- [x] **Security finding 2 (real, fixed) — account deletion could silently orphan a container on a Docker
      failure.** Traced `deleteOwnAccount` fully: container teardown (via the existing `stopSession`, not
      reimplemented) already ran *before* `DELETE FROM users`, so the specific "orphan via bad ordering" race
      described going in does **not** exist — ordering was already correct. What was actually wrong: the teardown
      call was wrapped in `.catch(() => {})`, so if `destroyContainer` ever threw, that failure was silently
      swallowed and the user row got deleted anyway, cascading away the only DB row pointing at a container that
      might still be running — the same orphan condition, via error-swallowing instead of ordering. Fixed by
      letting that error propagate (deletion now aborts instead of leaving account/session/container
      inconsistent); also fixed the route handler, which previously mapped *any* `deleteOwnAccount` failure to
      "current password is incorrect" — a teardown failure now returns a distinct 500, so a user isn't told their
      correct password is wrong when the real problem is an internal failure to retry.
- [x] **Security finding 3 (reviewed, no change) — rate limit tuning.** Current values (login 10/15min keyed
      IP+email, signup 5/15min IP, change-password 5/15min per-user, forgot-password 5/15min IP+email,
      reset-password 10/15min IP, delete-account 5/15min per-user) judged reasonable for this project's stated
      single-user/personal-tool scope: tight enough to matter against brute force, loose enough not to lock out a
      legitimate user's own instance. Left unchanged.
- [x] Verified: `npx tsc --noEmit` clean. `npm test` (unit) — 3 files, 23 tests, all passing.
      `docker compose exec backend npm run test:integration` — 1 file, 6 tests, all passing against the real
      Postgres container. `docker compose up --build -d` (rebuild needed for the new migration + vitest
      devDependency) — all three services healthy afterward; `schema_migrations` confirms
      `0005_password_changed_at.sql` applied; `\d users` confirms the new nullable column.
- [x] Functional verification against the real running stack (throwaway accounts, all cleaned up afterward):
      token-invalidation fix — pre-change token rejected (401) after `/change-password`, fresh post-login token
      accepted (200); account-deletion fix — started a real session against the already-cached
      `disk-full-var-log` challenge image, confirmed the container `Up` via `docker ps`, deleted the account
      mid-session, confirmed via `docker ps -a` the container is fully gone (not just stopped) and the `users` row
      is gone; also re-ran the plain signup → display-name-update → delete and forgot-password-on-unknown-email
      flows to confirm they're unaffected. Post-hoc `docker ps -a --filter label=app=devops-trainer` and `users`/
      `sessions` row counts confirmed nothing from this pass was left behind. Left the dev-override stack running
      as the steady state.

## 2026-07-31 — HTTP security headers, npm audit fix, opt-in TLS overlay (decisions/0035)
- [x] **`helmet` added to `backend/package.json`** (justified exception to the no-new-dependencies rule, same
      category as `nodemailer` earlier — single-purpose, well-established security middleware, not UI work).
      Wired in as the earliest middleware in `backend/src/index.ts`, before `cors()`/`express.json()`, so every
      response — including error-handler responses — gets the headers.
- [x] **Hand-tuned CSP**, not helmet's raw defaults — the frontend's hand-built spotlight-glow/tilt/magnetic
      -button/shiny-text/click-spark effects depend on inline styles (`style={{...}}` and
      `element.style.setProperty(...)`, confirmed via `grep -rn style.setProperty frontend/src` — 7 files, 22 call
      sites, all CSS-custom-property writes, none of which are event-handler attributes or `dangerouslySetInnerHTML`,
      confirmed absent from the whole frontend). Final directives (`useDefaults: true`, then overridden):
      `script-src 'self'` (no CDN/inline script anywhere — confirmed via grep and reading `index.html` in full),
      `style-src 'self' 'unsafe-inline'` (the load-bearing one — keeps every inline-style effect working; dropped
      helmet's default `https:` since no third-party stylesheet is ever loaded), `img-src 'self' data:` (`data:`
      specifically for the one inline SVG noise-texture background in `styles.css`'s `--texture-grain`, the only
      non-`'self'` image source anywhere), `font-src 'self'` (all `@fontsource` webfonts are self-hosted; dropped
      helmet's default `https:`/`data:`), `connect-src 'self' ws: wss:` (same-origin XHR/fetch plus the terminal
      WebSocket, which uses `ws://`/`wss://` depending on page scheme), `frame-ancestors 'none'` (nothing is ever
      iframed — confirmed no `<iframe>` in the codebase), and `upgrade-insecure-requests` explicitly set to `null`
      (deletes it from helmet's default set entirely) — leaving it enabled would make browsers rewrite the
      terminal's `ws://` URL to `wss://`, breaking it against this project's actual default steady-state stack
      (plain HTTP, no TLS, per `docker-compose.yml`). Also set `frameguard: { action: "deny" }` (X-Frame-Options:
      DENY, nothing needs framing) and `referrerPolicy: { policy: "strict-origin-when-cross-origin" }` (aligned
      with the frontend's nginx-level policy below rather than left on helmet's stricter but inconsistent
      `no-referrer` default).
- [x] **`frontend/nginx.conf`**: added `X-Content-Type-Options`, `X-Frame-Options: DENY`,
      `Referrer-Policy: strict-origin-when-cross-origin`, and the same-reasoning CSP string, all scoped to the
      `location /` block only (nginx does not merge server-level `add_header` into a location that defines its
      own, and these were never set at server level to begin with) — so the `/health`, `/api/`, `/ws/` locations
      that `proxy_pass` to the backend carry zero nginx-added headers and get everything from the backend's own
      helmet config, unmodified, per the task's explicit "don't double-set or override" requirement.
- [x] **npm audit fix (backend)**: before, 2 moderate vulnerabilities (`uuid` missing-buffer-bounds-check advisory,
      GHSA-w5hq-g745-h8pq, pulled in transitively via `dockerode@4.0.12`'s `uuid@^10.0.0` dependency). Plain
      `npm audit fix` couldn't resolve it without a major `dockerode` bump. Checked `dockerode@5.0.0`'s release
      notes first: its only breaking change is "dropped uuid package, bumped minimum node version requirement" —
      confirmed via `npm view dockerode@5.0.1 dependencies` that `uuid` is gone entirely from 5.0.1's dependency
      tree (replaced with `node:crypto`'s built-in `randomUUID`, no external dependency at all), and the new
      minimum (`node >= 14.17`) is far below this project's `node:20-alpine`. Every dockerode API this codebase
      actually calls (`docker.service.ts`: `listNetworks`, `createNetwork`, `listImages`, `buildImage`,
      `modem.followProgress`, `createContainer`, `getContainer().inspect/start/exec`, `modem.demuxStream`,
      `listContainers`) is untouched by the changelog — none of it is uuid-related. Bumped
      `dockerode` to `^5.0.1` and `@types/dockerode` to `^4.0.1` (the DefinitelyTyped version matching dockerode's
      v4/v5-era API surface). **Result: `npm audit` now reports 0 vulnerabilities** (down from 2 moderate).
      Verified this didn't break the highest-risk integration point in the codebase: `npx tsc --noEmit` clean,
      `npm test` (unit, includes `docker.service.test.ts`'s `imageTag`/`isNotModifiedOrMissing` tests) — 3 files,
      23 tests, all passing; `docker compose exec backend npm run test:integration` — 1 file, 6 tests, all passing
      against the real Postgres container after a full `docker compose up --build -d` rebuild.
- [x] **Opt-in TLS overlay**: `docker-compose.tls-example.yml` (new, NOT merged into `docker-compose.yml`/
      `docker-compose.override.yml` — only takes effect via explicit `-f docker-compose.tls-example.yml`) adds a
      `caddy:2-alpine` service publishing 80/443, and clears the `frontend`/`backend` services' own host port
      publishing via Compose's `!reset` merge tag (requires Compose v2.24.0+; this host runs v5.3.0 — verified via
      `docker compose -f docker-compose.yml -f docker-compose.tls-example.yml config` that the resolved config has
      no `ports:` left on `frontend`/`backend` and Caddy alone publishes 80/443) so Caddy becomes the sole
      internet-facing entrypoint once used. Companion `Caddyfile.example` routes `/health`, `/api/*`, `/ws/*` to
      the backend and everything else to the frontend, matching `frontend/nginx.conf`'s own routing exactly; Caddy
      upgrades WebSocket connections automatically, so the terminal bridge needs no special-casing. Caddy was
      chosen specifically for automatic Let's Encrypt provisioning/renewal via HTTP-01 with no manual
      certbot/cron/renewal-hook setup to get wrong — the whole TLS story is the one `Caddyfile.example`.
      README's existing "Security notes" section got a new "TLS / exposing beyond localhost (opt-in)" subsection
      alongside it: opt-in, requires a real domain + reachable 80/443, and reiterates (doesn't replace) the
      existing VPN/docker-socket warnings — TLS termination only encrypts the transport, it does not change the
      docker-socket root-equivalent-to-host risk from `decisions/0001`.
- [x] Verified: `cd backend && npx tsc --noEmit` clean. `cd frontend && npx tsc --noEmit` clean and
      `npm run build` clean (380 modules, no warnings beyond normal chunk-size output). `docker compose up
      --build -d` (rebuild needed for the new `helmet`/`dockerode` versions) — all three services healthy.
      Curled the real running backend directly (`curl -sD - http://localhost:4000/health`) and confirmed the
      exact intended CSP string is present with no `upgrade-insecure-requests` and no unexpected directives.
      Then, since a prior bug in this exact `nginx.conf` file (`decisions/0013`) once broke the WS path silently
      in *production only*, re-verified both transport paths per this project's established convention: brought
      up the real production stack (`docker compose -f docker-compose.yml up --build -d`, no override, port
      3000) and confirmed (a) `curl -sD - http://localhost:3000/` returns only nginx's own new headers
      (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, the CSP string) with no helmet-specific
      extras, since that request never reaches the backend, and (b) `curl -sD - http://localhost:3000/api/public-stats`
      returns the correct `{"challengeCount":50,"categoryCount":10}` JSON *and* the backend's own full helmet
      header set passed through unmodified (confirming nginx isn't double-setting or stripping anything on the
      proxied path). Restored the dev-override stack afterward (`docker compose up --build -d`) and re-ran both
      the unit and integration suites against it to confirm nothing regressed, per instruction, leaving it running
      as the steady state.
- [x] **Honest limits of this verification**: no headless browser exists in this environment, so the CSP's actual
      *enforced* runtime behavior (would a browser really keep every inline-style effect working, would it really
      allow the WebSocket) could not be watched directly. What was verified instead: the exact header string
      leaving both the backend and nginx matches the intended policy byte-for-byte, and every inline-style call
      site in the frontend was traced against `style-src 'self' 'unsafe-inline'` and confirmed to be a plain CSS
      custom-property write via `style={{...}}` or `.style.setProperty(...)` — nothing using `dangerouslySetInnerHTML`,
      inline event-handler attributes, or a `<style>` tag exists anywhere in the frontend, which is the class of
      thing this exact CSP would actually block.

## 2026-07-31 — "Explain" panel: an uncosted, always-available reasoning walkthrough (3 reference challenges)
A third content mechanic alongside Hints (progressive, tracked against `hints_used`) and Solution (full fix,
ends the challenge via the existing `window.confirm`) — neither of those was touched. Explain is a panel attached
directly to the terminal that a user can open/close freely, any number of times, mid-challenge, showing the
*reasoning* behind the fix rather than the exact commands. See `decisions/0036-*.md` for the full rationale
(schema choice, why it's read from disk per-request rather than synced into Postgres like hints/solution, the
3-now/47-later scope decision, and the sidebar/drawer placement reasoning).
- [x] `challenges/{perm-config-blocks-service,disk-full-var-log,systemd-crashloop-bad-config}/explain.json` — new
      per-challenge content file, an array of `{ order_index, title, explanation }` steps, authored by restructuring
      each challenge's existing `solution.md` into discrete reasoning steps (no new technical facts). The other 47
      challenges deliberately do not get this file in this pass.
- [x] `backend/src/services/challenge.service.ts`: new `ExplainStep` type + `getExplainSteps(slug)`, reading
      `challenges/<slug>/explain.json` directly off disk on every call (`fs.existsSync`/`fs.readFileSync`/
      `JSON.parse`, same idiom as `syncChallengesFromDisk`'s hints/solution reads) — **not** upserted into the DB,
      since there's nothing to track/invalidate for static, uncosted content. Missing file → `[]`, not an error.
- [x] `backend/src/services/session.service.ts`: new `getExplainSteps(sessionId, userId)`, same ownership check
      (`getOwnedSession`) `getHintsState`/`getSolution` already use, looks up the session's challenge slug and
      defers to `challenge.service.ts`'s disk read.
- [x] `backend/src/routes/sessions.routes.ts`: new `GET /api/sessions/:id/explain` — a plain read, no
      reveal/tracking mutation like `POST /:id/hints/reveal`, no `hints_used`/scoring/session-state effect at all.
- [x] **Security-critical, verified directly**: `docker.service.ts`'s `buildImage` `src` allow-list
      (`["Dockerfile", "seed.sh", "check.sh"]`) was not touched — `explain.json` is never `COPY`'d into the
      challenge image, same rule as `challenge.json`/`hints.json`/`solution.md`. Forced a real rebuild (deleted the
      3 challenges' cached images) and confirmed via `docker exec <container> find / -xdev -name "explain.json"`
      that it's genuinely absent from all three running containers post-rebuild, not just absent by (stale)
      allow-list reasoning.
- [x] Frontend: `frontend/src/api/client.ts` (`ExplainStep` type + `getExplainSteps`), `frontend/src/api/queries.ts`
      (`useExplainSteps`, `staleTime: Infinity` — static per-challenge content), new
      `frontend/src/components/ExplainPanel.tsx` (renders nothing at all, not even the toggle, when `steps` is
      empty — graceful absence, not a broken-looking empty panel). `ChallengeDetailPage.tsx` wraps `.terminal-frame`
      + `<ExplainPanel>` in a new `.terminal-explain-layout` (only gains `.has-explain` when steps exist): a plain
      flex column (drawer below the terminal, using the same `grid-template-rows: 0fr → 1fr` collapse `.auth-collapse`
      already uses) below the existing `min-width: 900px` breakpoint `.dashboard-grid` already uses for its own
      sidebar split, becoming a flex row (fixed ~300px sidebar beside the terminal) at and above it. Zero new npm
      dependencies — plain `useState` for open/closed, owned entirely by `ExplainPanel` itself. Explicit
      `prefers-reduced-motion` overrides added for the new chevron-rotation and collapse transitions, alongside the
      file's existing blanket `animation-duration`/`transition-duration` override.
- [x] Verified: `cd backend && npx tsc --noEmit` clean, `npm test` (3 files, 23 tests) all passing unchanged.
      `cd frontend && npx tsc --noEmit` clean, `npm run build` clean (381 modules, no CSS-minifier warnings),
      `npm test` (Vitest, 5 files, 28 tests) all passing. `docker compose up --build -d` — all three services
      healthy. Signed up a throwaway account, started a real session on each of the 3 reference challenges, and
      confirmed `GET /api/sessions/:id/explain` returns real, non-empty step content for all three; started a
      session on a 4th, non-reference challenge (`user-account-locked`) and confirmed the same endpoint returns
      `{"steps":[]}`, not an error. Re-verified hints/solution/check-fix are completely unaffected on
      `perm-config-blocks-service`: revealed a hint (tracked as before), confirmed `check` fails pre-fix, applied
      the real fix as `trainee` via `docker exec`, confirmed `check` then passes, confirmed `GET /solution` still
      returns the unchanged `solution.md`. Cleaned up every session/container created during verification and
      deleted the throwaway account. Left the dev-override stack running as the steady state afterward.
- [x] **Honest limit**: no headless browser exists in this environment, so the panel's actual rendered layout (does
      the 900px breakpoint genuinely read as "sidebar attached to the terminal," does the row-collapse animate
      smoothly) could not be watched directly. Verified instead by careful reading of the CSS against this app's own
      already-shipping, presumably-visually-confirmed patterns it directly reuses (`.dashboard-grid`'s identical
      breakpoint, `.auth-collapse`'s identical collapse technique) rather than a new layout mechanism introduced
      sight-unseen.

## Challenge catalogue expansion — 50 → 100 (decisions/0037-0046)
Doubled the challenge catalogue, adding 50 new challenges across all 10 existing categories (no new
categories — each category's target roughly doubled). Delivered in 10 batches of ~5 challenges each,
run 2 batches at a time as separate background agents, after an initial fully-parallel 5-batch attempt
hit real infrastructure instability (background-task stalls and connection drops, recovered from by
resuming agents from their transcripts rather than restarting, and by reducing concurrency going
forward). Every single challenge, across every batch, went through the same non-negotiable loop this
project has required since `decisions/0007`: `docker build` clean → run with the platform's real flags
→ `check.sh` fails non-zero before any fix → the intended fix applied as the unprivileged `trainee`
user (never root) → `check.sh` passes. At least 2 challenges per batch were additionally verified
through the real running API (real session start, real `docker exec` fix, real check-pass), not just
the isolated build loop.
- [x] **Cron & scheduling** — 3 more (`cron-timer-missing-persistent`, `cron-overlapping-job-no-lock`,
      `cron-timezone-mismatch`) + 2 added in the earlier partial batch = **9/9 total**. See `decisions/0037`.
- [x] **Package management** — 5 new (`pkg-apt-mark-hold-blocks-upgrade`, `pkg-conflicting-pin-priorities`,
      `pkg-ssl-cert-postinst-never-ran`, `pkg-stale-sources-list-entry`, `pkg-force-removed-shared-lib`) =
      **9/9 total**. Caught and fixed two real tooling bugs along the way (a `dpkg-scanpackages
      --multiversion` flag omission, and Debian 12's newer deb822 `sources.list.d` format needing
      explicit handling). See `decisions/0038`.
- [x] **Disk & filesystem** — 4 more (`fs-circular-symlink-blocks-startup`,
      `disk-stale-lock-file-fills-tmpfs`, `disk-thumbnail-cache-never-pruned`,
      `disk-tmpfs-mount-path-mismatch`) + 1 from the earlier partial batch
      (`disk-core-dumps-fill-tmpfs`) = **11/11 total**. The verify loop itself caught a sizing bug (a
      16MB tmpfs that could never reach a passing post-fix state) before it shipped. See `decisions/0039`.
- [x] **Logs & journald** — 5 new (`logs-logrotate-create-wrong-owner`, `logs-journald-storage-none`,
      `logs-rsyslog-facility-collision-mail`, `logs-dead-symlink-destination`,
      `logs-journald-forward-to-syslog-disabled`) = **9/9 total**. Journald mechanisms were pre-validated
      by hand before committing to the design, specifically to avoid the exact traps `decisions/0016`
      already documented (journald's own runtime self-enforcement doesn't survive a real build/run
      cycle; a persistent-journal-permissions idea would get silently "healed" by systemd's tmpfiles
      logic). See `decisions/0040`.
- [x] **Permissions & ownership** — 5 new (`perm-capability-lost-on-redeploy`, `perm-acl-deny-blocks-user`,
      `perm-socket-group-blocks-client`, `perm-umask-hides-files-from-consumer`,
      `perm-noexec-mount-blocks-service-helper`) = **11/11 total**. Two genuinely new infrastructure
      findings surfaced and documented: POSIX ACLs don't survive a Docker image build/export (same class
      of gotcha as tmpfs being empty at container start — the fix moved ACL application into `CMD`), and
      a per-connection-recreated socket needs both an immediate live-socket fix and a durable
      directory-level one. A seed idea (`chattr +i`) was tested and correctly ruled out — it needs a
      capability (`LINUX_IMMUTABLE`) this platform doesn't grant. See `decisions/0041`.
- [x] **Users/groups/sudo** — 5 new (`sudoers-dropin-syntax-error`, `user-primary-group-mismatch`,
      `user-shell-binary-missing`, `user-duplicate-uid`, `user-password-expired-chage`) = **10/10 total**.
      One seed's premise was empirically tested and disproven (a sudoers drop-in syntax error only voids
      that one file's own rules, it never cascades to break all of sudo) and honestly reframed around
      what's actually true instead. See `decisions/0042`.
- [x] **Process & performance** — 5 new (`proc-limitnofile-ceiling-too-low`,
      `proc-cpu-affinity-starvation`, `proc-nice-priority-starvation`, `proc-pidslimit-fork-exhaustion`,
      `proc-hung-dependent-service`) = **10/10 total**. Two real pivots were caught only by actually
      running the verify loop, not by design review: the CPU-starvation challenge needed 2 full vCPUs
      instead of this category's usual 0.5 (0.5 causes CFS bandwidth-quota fragmentation that inverts the
      intended starvation effect), and the pids-exhaustion challenge needed a small reap loop as PID 1
      instead of a bare `sleep infinity`, since killed children become permanent zombies that still count
      against the `pids` cgroup ceiling. See `decisions/0043`.
- [x] **Networking & DNS** — 5 new (`net-bind-wrong-interface`, `net-unix-socket-path-mismatch`,
      `dns-resolv-search-domain-wrong`, `net-services-port-lookup-stale`,
      `systemd-active-not-holding-port`) = **10/10 total**. A firewall/iptables seed idea was tested and
      correctly ruled out (this platform never grants `NET_ADMIN`, confirmed directly against
      `docker.service.ts`) and swapped for a real `/etc/services`/`getservbyname()` mechanism instead.
      Incidentally re-confirmed `decisions/0003`'s one-live-session-per-user behavior during its own
      real-API verification. See `decisions/0044`.
- [x] **systemd & services** — 5 new (`systemd-missing-after-ordering`, `systemd-dropin-port-override`,
      `systemd-condition-path-not-met`, `systemd-socket-path-mismatch`,
      `systemd-missing-environment-file`) = **11/11 total**. A seed idea (a wrong-*permission*
      `EnvironmentFile=`) was correctly ruled out mid-design: systemd itself reads that file as root
      before ever dropping to the service's own user, so permission bits on it are inert — exactly the
      fake-break pattern `decisions/0007` warns against — and was swapped for the file being genuinely
      *missing* instead (using the optional `-` prefix, which really does suppress the error). See
      `decisions/0045`.
- [x] **SSH & remote access** — 5 new (`sshd-authorizedkeysfile-wrong-path`,
      `sshd-listening-on-nonstandard-port`, `ssh-client-config-bad-perms`, `sshd-maxauthtries-too-low`,
      `sshd-ciphers-negotiation-mismatch`) = **10/10 total**. A chrooted-SFTP seed idea was actually built
      end-to-end (real `ldd`-computed dependency closure, minimal `/etc/passwd`/`/etc/group`, device
      nodes) before an undocumented NSS `dlopen()` dependency invisible to static `ldd` analysis was
      found blocking it — honestly documented and swapped for a cipher-negotiation-mismatch scenario
      instead, per `AUTHORING.md`'s own explicit fallback guidance. See `decisions/0046`.
- [x] **Verified**: every one of the 50 new challenges independently spot-checked (fresh `docker build`)
      by re-running a sample from each batch directly, not just trusting each batch's own self-report;
      final catalogue count independently confirmed at exactly **100** by direct directory listing.
      `tasks.md` and all 10 `decisions/0037`-`0046` batch documents were kept off-limits to every
      individual batch agent (to avoid 10 concurrent/near-concurrent writers racing on the same files)
      and consolidated here in one pass afterward.

## `explain.json` backfill across all 100 challenges (decisions/0047)
The "Explain" walkthrough panel shipped (2026-07-31) with only 3 reference `explain.json` files; the
other 97 challenges silently rendered no panel (by design — `ExplainPanel` returns nothing rather than
an empty-looking state for a missing file). With the catalogue now at 100, backfilled the remaining 97
in 5 waves of 2 parallel background agents each, grouped by category, same "2 at a time" cadence as the
catalogue expansion. Unlike that expansion, this work touched no Docker at all — pure content authoring
(read `challenge.json`/`seed.sh`/`check.sh`/`solution.md`/`hints.json`, write 4-6 reasoning steps),
so no build/run/check loop was needed per file.
- [x] **Wave 1** — cron-scheduling (9) + disk-filesystem (10) = 19.
- [x] **Wave 2** — logs-journald (9) + networking-dns (10) = 19.
- [x] **Wave 3** — package-management (9) + permissions-ownership (10) = 19.
- [x] **Wave 4** — process-performance (10) + ssh-remote-access (10) = 20.
- [x] **Wave 5** — systemd-services (10) + users-groups-sudo (10) = 20.
- [x] **Correctness guardrails carried into every relevant batch's agent prompt**, to avoid an explain
      step describing the wrong mechanism (worse than no panel at all): `decisions/0007`'s root-ignores-DAC
      rule and its two named exceptions (execute bit; sshd/ssh-client StrictModes-style enforcement) for
      permissions/SSH; `systemd-missing-environment-file`'s file-must-be-*missing*-not-unreadable framing
      (systemd reads `EnvironmentFile=` as root before dropping to the unit's own user, so permissions on
      it are inert); the empirically-confirmed single-file-scope of a sudoers drop-in syntax error (doesn't
      cascade to break sudo system-wide); no `NET_ADMIN`/iptables framing anywhere in networking-dns; no
      live-`apt`-against-network framing anywhere in package-management (all package state is corrupted via
      direct dpkg-database edits, no internet in the container); zombies still counting against a `pids`
      cgroup ceiling and `proc-cpu-affinity-starvation` needing the full 2-vCPU quota, both carried forward
      from the original process-performance challenge-authoring pass.
- [x] **Verified**: all 97 new files independently re-validated by me directly (`python3 -m json.tool`)
      after every single wave, not trusted from agent self-reports; final catalogue-wide count confirmed
      at exactly **100/100** via `find challenges -name explain.json | wc -l`. No file other than the new
      `explain.json` per slug was touched by any agent. No backend restart needed — `explain.json` is read
      live off disk per-request, unlike `challenge.json`.
