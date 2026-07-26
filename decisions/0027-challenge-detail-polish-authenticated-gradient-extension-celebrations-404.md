# 0027 — Challenge-detail visual polish, authenticated-page gradient extension, milestone celebrations, real 404 page

Four bundled frontend improvements, all scoped to `projects/linux-incident-trainer/frontend/`. No backend
changes, no new npm dependencies, light theme only — same constraints as every design pass since
decisions/0017.

## 1. Challenge-detail page polish

`ChallengeDetailPage.tsx`/`TerminalPane.tsx` had zero design-pass attention all project while the marketing
pages went through five rounds of it (decisions/0018, 0022-0026). Brought the working page up to the same
"modern card" language, kept deliberately quieter than the marketing pages since this is a page a user
stares at for 10-20 minutes solving a real problem, not a hero moment:

- New `.challenge-panel` class (two-layer soft shadow — the same box-shadow numbers as `.feature-card`/
  `.marketing-nav-card`/`.self-host-card`) wraps the header/description block, and is reused on the
  solution reveal card. A new `.hint-card` gets the same shadow for the hint-reveal list.
- `.challenge-detail-page::before` adds the same page-wash mechanic as Dashboard/Challenges/Progress
  (see #2 below), but deliberately held at the *original*, pre-boost alpha band (0.08-0.11, teal + violet
  only, no rose) — the one authenticated page kept restrained on purpose, per the brief's explicit
  instruction that this particular page shouldn't compete with reading terminal output.
- `.terminal-frame` wraps `.terminal-wrap` (the chrome *around* `TerminalPane`/xterm.js — xterm's own
  theme and `.terminal-wrap`'s dark background are untouched, per decisions/0017's "real terminal stays
  dark" rule) in a slow (42s), mostly-transparent conic-gradient ring, reusing the hero terminal's
  `--border-angle` `@property` mechanism (`.hero-terminal-frame`, decisions/0018) rather than a fourth
  animation technique — but toned down hard: most of the ring is `transparent`, and the spin is 6x slower
  than the hero's, so it reads as ambient rather than a second signature moment.
- The check-result banner (`✅`/`❌` emoji previously) now uses hand-drawn stroke-glyph icons
  (`CheckCircleIcon`/`XCircleIcon`, same 22x22 convention as every other icon in the app) inside a
  `.challenge-check-alert` flex layout — the emoji was the one place in this codebase that didn't already
  follow its own "no emoji, hand-authored SVG" icon rule.

## 2. Bold gradient palette extended to Dashboard/Challenges/Progress

decisions/0026 authorized the new `--color-gradient-violet`/`--color-gradient-rose` tokens for
gradient/glow use and applied them at real, visible alpha (~0.11-0.30 per stop) to the six marketing
routes only; `.dashboard-page`/`.challenges-page`/`.progress-page::before` were left on the original
`decisions/0021` restrained pairing (single accent/success/warning stop pair at 0.05-0.07). Per direct
instruction, extended the same bold treatment to these three authenticated pages so the whole app reads
as one cohesive family rather than "marketing gets real color, the actual product doesn't":

- Each page keeps its existing semantic lead hue and focal point from decisions/0021 (accent for
  Dashboard, warning for Challenges, success for Progress) and layers in a violet/rose pairing as the
  2nd/3rd stop, at the same ~0.10-0.22 alpha band the marketing pages use — genuinely visible, not a
  token gesture repeat of the prior "I can't see it" failure mode.
- Distinct focal-point arrangement per page (Dashboard: accent top-right + violet lower-left + success
  whisper bottom-center; Challenges: warning top-left + rose right + accent low-center; Progress: success
  top-right + violet lower-left + warning whisper bottom-center) so the three stay visually
  distinguishable from each other and from every `.marketing-page-header--*` variant.
- Applied `.gradient-heading` (existing clip-to-text utility, decisions/0026) to exactly one heading per
  authenticated page — Dashboard's `Welcome back, {name}` H1, Challenges' `Challenges` H1, Progress's
  `Your solve record` H1 — matching the "exactly one gradient headline per page" rule already
  established for the marketing family.

## 3. Milestone celebrations — first solve, category complete

Two triggers, both derived from data the app already fetches via `useProgress()` — no new backend
endpoint, column, or computation:

1. **First-ever solve**: total `solved` goes from 0 to 1.
2. **Category complete**: a category's `solved` reaches its `total` for the first time.

**Detection approach** (`ChallengeDetailPage.tsx`, `snapshotProgress`/`detectCelebration`): a snapshot of
`progressQuery.data` (overall `solved`, and the specific category's `solved`/`total` for the challenge
being checked) is captured synchronously right *before* `checkMutation.mutate` fires — not inside
`onSuccess`, since by then `useCheckSession`'s own `onSuccess` (in `queries.ts`) has already called
`invalidateQueries` on the progress key, so reading `progressQuery.data` at that point is racy. On a
passed check, `progressQuery.refetch()` is awaited explicitly (rather than trusting cache timing after
invalidation) and the resolved fresh data is compared against the snapshot. This naturally satisfies "must
not fire on a re-check of an already-solved challenge" with no special-case code: if the challenge (and by
extension its category) was already solved, the "before" snapshot already reflects that state, so neither
condition can newly become true on a repeat check — verified this is actually true against the real API,
not just reasoned about (see Verification below).

First-solve is checked ahead of category-complete in `detectCelebration` — a user's very first check could
also be their first category completion if that category has exactly one challenge, and "first incident
solved" is the more meaningful message to lead with in that overlap.

**Celebration UI** (`components/Celebration.tsx`): a fixed-position, top-center banner — pointer-events
`none` on the wrapper, `auto` only on the card, so it's dismissible but never blocks a click or traps
focus the way a modal would. Hand-built visual: a thin animated ring using the same `--border-angle`
`@property` conic-gradient mechanism as `.hero-terminal-frame`/`.terminal-frame` (masked down to just the
1.5px edge via `mask-composite: exclude` rather than a padded fill, so it reads as a ring not a halo), plus
a hand-drawn stroke icon (checkmark-in-circle for first-solve, a six-point star for category-complete — no
emoji, no confetti library) and copy in the app's plain/direct voice ("First incident solved. That one's
fixed. The rest of the queue is still broken — go pick another." / "{category}: cleared. Every challenge in
{category} is now solved. Move on to another category, or revisit one for practice."). Auto-dismisses
after 6s (`window.setTimeout`) with a manual close button as well. No bespoke reduced-motion handling was
needed: the file's existing global `@media (prefers-reduced-motion: reduce) { * { animation-duration:
0.001ms !important; ... } }` override (end of `styles.css`) already catches any new animation by
selector-agnostic design, so the ring-spin and entrance animation both collapse to their end state
near-instantly for reduced-motion users, satisfying "skip the animated entrance, just appear" without
adding a second code path.

**Toast-vs-separate-layer judgment call**: kept entirely separate from `ToastContext`, not added as a new
toast "kind." `ToastContext`'s `Toast` interface is a plain `{ kind, message: string }` — queued,
bottom-right, small. A celebration needs richer composed content (icon + two-line copy + colored ring) at
higher visual prominence (top-center, larger) for a genuinely rare one-off moment, not a routine status
notice. Bolting that onto the toast queue would mean either changing its contract for every existing caller
(three call sites, all plain strings) or smuggling JSX through a string-typed field. A distinct component
was the lower-risk, more legible choice. The existing "Check passed!" toast still fires alongside a
celebration when one triggers — deliberately not suppressed, since the toast communicates the routine
"solved" status regardless of milestone, and the celebration is an occasional addition on top rather than
a replacement for it.

## 4. Real 404 page

Replaced `<Route path="*" element={<Navigate to="/" replace />} />` (silent redirect, no explanation) with
`pages/NotFoundPage.tsx`. Sits outside `<RequireAuth>` (same tier as `/about`) so it's reachable regardless
of login state, and renders `<NavBar/>` directly (which already no-ops when logged out) rather than
`MarketingLayout`'s nav/footer, since a logged-in user hitting a bad link shouldn't be dropped into the
public marketing chrome.

Themed as a `systemctl status`/`curl` transcript reporting the 404 — reuses the existing dark "real
terminal" chrome (`.hero-terminal`, `.hero-terminal-bar`/`-dot`/`-title`, the `--term-mock-*` tokens)
rather than a new terminal look, since the content is meant to read as genuine command output, the same
register the hero mockup and the real `TerminalPane` both already occupy (decisions/0017's "real terminal
stays dark" rule). The CTA branches on `useAuth()` exactly like the marketing pages' own auth-branched CTAs
(`LandingPage.tsx`'s final CTA, `MarketingLayout.tsx`'s nav/footer): `/dashboard` if logged in, `/` if not.

## Verification

- `npx tsc --noEmit` — clean, no output.
- `npm run build` — clean, no CSS-minifier warnings (checked every new multi-line comment for a stray
  `*/`; none found).
- Grepped both the built `dist/assets/index-*.css` and a live `curl` of `http://127.0.0.1:5173/src/styles.css`
  for the new class names (`challenge-detail-page`, `celebration-wrap`, `notfound-page`, `gradient-heading`,
  `terminal-frame`, `hint-card`) — all present in both, confirming the running `:5173` dev-override stack
  (bind-mounts `frontend/src`) is actually serving the edits, not just the build artifact. Also curled
  `ChallengeDetailPage.tsx`, `App.tsx`, and `NotFoundPage.tsx` directly from `:5173` and grepped for the new
  component/class references — present (`App.tsx`'s live response shows the compiled `NotFoundPage` route).
- Curled `/some-nonexistent-route` on `:5173` — `200 OK`, SPA shell served (routing is client-side, so a
  200-with-shell is the correct outcome, not a 404 status from the dev server itself).
- **Functional test of the celebration-detection logic against the real running stack**, not just by
  reading the code: signed up a throwaway account (`celebtest_verify@example.com`) via
  `POST /api/auth/signup`. Started a real session for `perm-config-unreadable-by-app`, `docker exec`'d the
  actual fix (`chown root:billing` + `chmod 640` on `/etc/billing/billing.conf`) as root then verified as
  the `billing` user, called `POST /api/sessions/:id/check` — `passed: true`, and `GET /api/progress`
  before/after showed `solved: 0 -> 1`, confirming `detectCelebration` would correctly return
  `{ kind: "first-solve" }`. Re-called `check` on the same already-solved session — `passed: true` again,
  but progress stayed at `solved: 1` both before and after, confirming no re-trigger. Solved the remaining
  five `permissions-ownership` challenges one at a time via real `docker exec` fixes
  (`perm-executable-bit-missing`: `chmod +x`; `perm-service-logdir-unwritable`: `chown`+`chmod` on the log
  dir; `perm-sticky-bit-missing-shared-dir`: `chmod +t`; `perm-config-blocks-service`: started nginx and
  fixed `/var/www/html` perms to 755/644; `perm-setuid-helper-bit-stripped`: `chmod u+s` on the helper
  binary), checking progress via `GET /api/progress` after each. The final challenge's before/after
  (`categorySolved: 5/6 -> 6/6`, `totalSolved: 5 -> 6`) confirmed `detectCelebration` returns
  `{ kind: "category-complete", categoryName: "Permissions & Ownership" }` — distinguishable from
  first-solve since `totalSolved` was already nonzero. Started a *new* session for the same
  already-completed challenge (a fresh container re-seeds the break), re-applied the fix, and re-checked:
  progress stayed at `6/6` both before and after, confirming category-complete does not re-fire once a
  category is already fully solved, even on a legitimately-passing recheck.
- Cleaned up: stopped every test session (`GET /api/sessions/active` confirms `null` and
  `docker ps -a --filter label=app=devops-trainer` confirms zero containers, orphaned or otherwise), then
  deleted the throwaway user row directly via `docker compose exec postgres psql` (no self-service
  account-deletion endpoint exists in this app) and confirmed the row is gone.
- `docker compose ps` — all three services `Up`/`Up (healthy)` (dev-override stack already running from a
  prior session, left as-is; no rebuild needed since bind-mounted source picked up every change through
  Vite's dev-transform).
- **No headless browser is available in this environment** — same caveat as every prior visual pass on
  this project. Given this pass's specific history of "changes exist in code but aren't visible"
  incidents, verification leaned as hard as possible on evidence that isn't "trust the CSS reasoning":
  byte-for-byte grepping the actual live dev-server response (not just `dist/`) for every new class name,
  and — for Part 3 specifically, the one part with real conditional logic rather than pure CSS — driving
  the entire detection path through the real backend API and real challenge containers rather than only
  reasoning through `detectCelebration`'s code. An actual look in a browser remains the one thing this
  environment cannot do.
