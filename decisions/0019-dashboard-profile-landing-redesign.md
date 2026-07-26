# 0019 — Authenticated dashboard as `/progress`'s companion (not replacement), password-change security model, and landing-page redesign direction

## 1. Dashboard vs. Progress: coexist, not merge

**Decision:** `/dashboard` and `/progress` both exist. `/dashboard` is the new post-login landing page and shows a
*lighter* progress summary (overall solved/total bar + top 3 categories by solve rate); `/progress` is unchanged and
remains the detailed, full-breakdown view (all categories, in fixed category order).

**Why not merge them:** `/progress` already has a real, specific job — a complete per-category audit — and folding
that into the dashboard would either (a) force the dashboard to show all 10 categories every time, defeating the
point of a "calm overview, not a cluttered analytics screen" home page, or (b) force `/progress` itself to become the
landing page, which would demote "browse challenges" (still the actual core content, per the brief) to second
billing on the one page every session starts from.

**Why this can't drift into two competing "your stats" UIs:** both pages call the *same* `useProgress()` React Query
hook (`frontend/src/api/queries.ts`), which uses the same query key (`["progress"]`) and therefore the same cache
entry. `DashboardPage`'s `ProgressSnapshotCard` and `ProgressDashboardPage` are two different renderings of one
fetch, not two fetches — a solve anywhere in the app invalidates that one query key (see `useCheckSession`'s
`onSuccess`), and both pages pick up the new numbers from the same place. There is structurally no way for them to
show different solved counts short of a stale-cache window affecting both equally.

The same reasoning applies to the "continue where you left off" card (`useActiveSession()` — the identical query
`ChallengeDetailPage` already uses for resume, not a second session-polling implementation) and the "pick up next"
recommended-challenges row (`useChallenges()` — the identical query `ChallengeListPage` uses, filtered client-side to
unsolved-first).

## 2. Password-change security model

**Decision:** `POST /api/auth/change-password` requires `currentPassword` + `newPassword`, verifies the current
password with `bcrypt.compare` against the stored hash *before* any write happens, and only then re-hashes and
updates. On any failure (wrong current password, or the account somehow not found) it returns the same generic
`{"error": "current password is incorrect"}` — never a different message for "account not found" vs. "wrong
password", so the response can't be used to enumerate accounts or fingerprint internal state.

**No exception path.** There is no way to change a password without proving the current one first — not even from
an already-authenticated session. A stolen JWT (7-day expiry, `decisions/0006`) is a real threat model for a
personal tool where the token lives in `localStorage`; requiring the current password on top of a valid JWT means a
stolen token alone can't be used to lock the real owner out by rotating their password.

**Rate limiting is per-user, not per-IP.** Every other rate limiter in this app (`login`, `signup`) is keyed by IP or
IP+email, because the attacker in those cases doesn't yet have a valid session. Change-password is different: the
caller already has a valid JWT for a specific account, so the only thing worth limiting is *attempts against that
one account*, regardless of which IP they arrive from (a stolen token could easily be replayed from anywhere).
Keyed via `req.userId`, which `requireAuth` guarantees is set before the limiter middleware runs (route order:
`requireAuth` → `changePasswordLimiter` → handler). Verified directly: hammering one account's change-password
endpoint with a wrong password started returning `429` after the configured threshold, while a second, unrelated
account continued to get normal `400`s immediately afterward — confirming the bucket is per-account, not global.

**Display name has no such gate.** It's a cosmetic field with no confidentiality or account-takeover implication —
same trust level as at signup, where it's accepted with zero extra proof of identity. `PATCH
/api/auth/display-name` requires only `requireAuth`.

## 3. Landing page: third pass — direction and why it's a bigger swing than the last one

**Where the previous three passes left off** (`decisions/0012`, `0017`, `0018`): a Stripe-inspired bento grid, a
dark→light theme flip, a texture/micro-interaction pass, then a visual-identity pass that picked a real typeface
pairing, a deep-teal accent, and turned the hero terminal into a character-by-character transcript reveal — the
one genuinely bold, specific signature element on the page. Direct feedback after all of that: still not landing.

**Diagnosis:** everything *around* the hero terminal was still a fairly conventional light-SaaS page — centered
pill eyebrows, a generic numbered-card list for the walkthrough, plain FAQ rows — with the monospace/terminal
identity confined to one moment instead of running through the page the way the user's Supabase reference actually
does (code/terminal language shows up **everywhere** on supabase.com: the hero, the feature grid, the pricing table,
not just one hero graphic).

**What changed this pass, concretely:**

1. **The terminal/monospace language now recurs in four more places, not just the hero:**
   - The wordmark gets a tiny three-dot "terminal traffic light" mark (`.brand-mark`) — the smallest possible
     callback, appearing in the nav on every scroll position.
   - Every major section head now opens with a monospace directory-path kicker (`~/features`, `~/how-it-works`,
     `~/self-host`, `~/faq`) instead of the old plain centered heading alone.
   - Each feature card gets a small code-editor-style tab-strip header naming the **real file in this codebase**
     that backs that card's claim — `seed.sh`, `terminalSocket.ts`, `check.sh`, `hints.json`, `challenge.json`,
     `session.service.ts` are all genuine paths under this repo's `challenges/<slug>/` directories and
     `backend/src/`, not invented filenames. This is a direct application of `frontend-design`'s "structure should
     encode something true about the content" principle, and it's also honest in the same sense `decisions/0012`
     already committed to (no fabricated trust signals) — the page is quite literally naming its own source files.
   - The walkthrough section (previously a plain numbered-card list) is now presented as an actual annotated shell
     script inside a bordered panel titled `walkthrough.sh`: each step is a `# comment`-styled title, a `$ command`
     line that is a **real, literal call the app makes at that point** (a documented API route like `POST
     /api/challenges/:slug/sessions` or `POST /api/sessions/:id/check`, or an in-container shell command like
     `systemctl status app.service` — the same style already used in the hero transcript), and the existing prose
     body. Numbering here is earned, not decorative, per `frontend-design`'s explicit caution against numbered
     markers on non-sequential content — a walkthrough of ordered steps genuinely is a sequence.
   - FAQ questions are now prefixed with a monospace `>` prompt glyph instead of plain text.

   **Deliberately kept light, not dark**, unlike the hero terminal and the self-host code block. Those two stay
   dark because they depict the *actual* product terminal (`decisions/0017`'s established rule). The walkthrough
   panel is a different kind of surface — a code-editor-style presentation device for five steps, not a screenshot
   of the real dark terminal — so it uses the page's normal light tokens. Introducing a third dark surface risked
   quietly working against this pass's own explicit constraint ("keep the light theme — do not make anything
   dark"), even though the hero/self-host precedent exists; safer and just as on-brand to keep it light.

2. **Two hand-implemented component-library patterns**, per the brief's explicit instruction to borrow *patterns*
   from shadcn/Aceternity/Magic UI/21st.dev without adding them as dependencies:
   - **Spotlight-hover glow on feature cards** — a `pointermove` handler writes `--spot-x`/`--spot-y` CSS custom
     properties directly onto the hovered card's `style` (a DOM mutation, not React state — re-rendering a card, or
     the whole grid, on every pointermove would be exactly the kind of unnecessary re-render
     `vercel-react-best-practices` warns against for a purely visual effect), consumed by a `radial-gradient`
     pseudo-element at a single low opacity (0.13). Gated to `pointer: fine` in CSS, so it's simply inert on touch
     rather than faked or stuck at a stale position.
   - **Animated conic-gradient ring around the hero terminal** — a rotating gradient frame using `@property
     --border-angle` for a smoothly interpolable custom property (pure CSS `@keyframes`, no JS `requestAnimationFrame`
     loop needed since the browser can natively animate a registered custom property). This is the pass's one
     "craft" upgrade to the existing signature element — the transcript-reveal logic itself (`decisions/0018`) is
     untouched.

   **Deliberately limited to these two.** The user has twice given feedback that a prior animation pass read as
   either gimmicky or too subtle — the corrective read from that history is precision over quantity, not "add more
   effects to compensate." Every other interaction on the page (scroll-reveal, count-up stats, button hover lift)
   is exactly what shipped in `decisions/0012`/`0018` and is untouched here.

3. **What was explicitly *not* redone:** hero copy, the FAQ answers, the self-host section's content, the overall
   page structure (hero → stats → features → walkthrough → self-host → FAQ → final CTA), and the accent
   hue/typography from `decisions/0018` are all unchanged. This pass is scoped to "make the terminal/code identity
   a through-line and add real craft in one or two places," not a full rebuild — the parts of the last three passes
   that were never the complaint (the palette, the type pairing, the page's actual information architecture) had no
   reason to change again.

## Verified
- `npx tsc --noEmit` and `npm run build` clean on both `backend/` and `frontend/`.
- One real bug caught during verification, not just a clean-build rubber stamp: a CSS comment written as `...under
  challenges/*/ and backend/src/...` contained a literal `*/` mid-sentence, which closes a CSS block comment early.
  `esbuild`'s CSS minifier (invoked by `vite build`) flagged this as a syntax warning pointing at the exact line;
  traced to the source comment in `styles.css`, reworded to avoid the character sequence, confirmed the warning is
  gone on rebuild, and grepped the built `dist/assets/index-*.css` for the intended selectors
  (`.hero-terminal-frame`, `.feature-card-tab`, `.walkthrough-terminal`, `.section-kicker`, `--border-angle`,
  `.dashboard-header`, `.navbar-user`) to confirm they landed correctly in the real bundle, not just that the build
  didn't crash.
- Rebuilt and booted the real stack (`docker compose up --build -d`); `postgres` healthy, `backend`'s `/health`
  returned `{"status":"ok"}`.
- Exercised the real backend end-to-end (not just read the code): signed up a fresh account and confirmed
  `/api/auth/me`, `/api/sessions/active` (correctly `null` pre-session), `/api/progress`, and `/api/challenges` (50
  real challenges) all return real data through a bearer token — the exact four queries the new dashboard consumes.
  Changed that account's password via the real endpoint: a wrong current password was rejected (400, generic
  message), a new password with whitespace was rejected (400), the correct current password succeeded (200), a
  subsequent login with the *old* password failed, and login with the *new* password succeeded — confirming the
  change actually took effect, not just that the endpoint returned 200. Hammered the same account's
  change-password endpoint past the configured attempt threshold and got `429`s with a `Retry-After` header; a
  second, unrelated account's own change-password call immediately afterward still got a normal `400`, confirming
  the limiter is keyed per-account rather than globally or per-IP.
- Confirmed the nav fix by code trace: `NavBar`'s brand `NavLink` targets `/dashboard`, `RootRoute` redirects
  authenticated visits to `/dashboard`, and `/dashboard` is a distinct registered route rendering `DashboardPage`,
  not an alias for `/challenges` — so clicking the brand while on `/challenges` now navigates to genuinely different
  content instead of no-op-ing.
- **No headless browser was available in this environment** (consistent with every prior design pass on this
  project) — the landing page's actual felt result (spotlight-glow subtlety, the hero border's rotation speed, the
  walkthrough terminal's real layout) was verified by reasoning through the exact CSS values and by confirming
  every new class/token in the built output, not a screenshot. A real look in a browser is still worth the user
  doing themselves.
- Test accounts created during verification (`test-verify-*@example.com`, `test-verify2-*@example.com`,
  `test-dash-*@example.com`) were deleted from `users` directly afterward. `docker ps -a --filter
  label=app=devops-trainer` was empty before and after this pass — no challenge session was started during this
  work (the constraint explicitly excluded touching session/docker orchestration code, and the dashboard's
  active-session card was verified against the endpoint response shape rather than a live container). Pre-existing
  user rows from earlier, unrelated testing sessions were left untouched. Dev-override stack (`docker-compose.yml`
  + `docker-compose.override.yml`) left running as the steady state.
