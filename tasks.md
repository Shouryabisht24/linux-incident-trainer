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
- Not done (explicit shortfall): full ~47-challenge catalogue — 27 delivered, all verified; the rest are the
      remaining per-category counts listed in Phase 4. WS terminal drive for the *new* challenges wasn't re-run
      per-challenge (the bridge itself was verified in Phase 2/3 and once here); lifecycle was validated via the
      API + docker exec instead.

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
