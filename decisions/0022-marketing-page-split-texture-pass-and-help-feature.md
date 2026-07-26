# 0022 — Marketing page split, page background washes, and a submission-only help feature

## Context

Three unrelated pieces of work landed together in one pass: `LandingPage.tsx` had grown to 782
lines composing nine distinct in-page sections behind anchor links (`#features`, `#walkthrough`,
`#self-host`, `#faq`); Dashboard/Challenges/Progress were visually flatter than the marketing page
now that Features/Walkthrough/SelfHost/Faq had their own hero-mesh-style backgrounds and those
three authenticated pages didn't; and there was no way for a user to ask a question or report a
problem from inside the app at all.

## Decision 1: anchor sections become real routes, not just a component split

`FeaturesSection`, `WalkthroughSection`, `SelfHostSection`, and `FaqSection` are now their own pages
(`FeaturesPage.tsx`, `HowItWorksPage.tsx`, `SelfHostingPage.tsx`, `FaqPage.tsx`) at `/features`,
`/how-it-works`, `/self-hosting`, `/faq` — directly linkable/shareable, rather than requiring a
visitor to land on `/` or `/about` first and scroll. `LandingNav` and `LandingFooter` moved out of
`LandingPage.tsx` into a new `MarketingLayout.tsx` so every one of these five public pages shares
identical chrome instead of four more copy-pasted nav/footer pairs.

This forced two things to be fixed that a naive "just move the JSX" split would have missed:

1. **`.landing`/`.section`/`.section-head` CSS scoping.** `styles.css` scopes `.section`'s max-width/
   padding and `.section-head`'s max-width/centering as descendant selectors under `.landing` (see
   the block starting `.landing .section {`). A lifted section rendered outside a `.landing`-classed
   ancestor silently loses all of that layout — it would still render, just wrong, which is worse
   than a build error. `MarketingLayout` renders its `<div className="landing">` wrapper around
   every child page's content specifically so this can't happen by omission.
2. **Two separate anchor-scroll implementations, not one.** `LandingNav`'s nav links used a
   `scrollToId(id)` factory; `Hero`'s "See how it works" CTA had its own, separate
   `scrollToWalkthrough` function with the same `getElementById(...).scrollIntoView(...)` shape.
   Both had to be found and replaced with real `<Link to="...">` targets — fixing only the nav (the
   obvious one) and missing Hero's own copy (easy to miss, since it's not part of `LandingNav` at
   all) would have left one dead `#walkthrough` link behind. Verified by grepping all of
   `frontend/src` for `scrollIntoView`/`getElementById` post-change: zero matches outside the
   unrelated, pre-existing `document.getElementById("root")` root-mount call in `main.tsx`.

`LandingPage.tsx` itself shrinks to `Hero`/`StatsSection`/`FinalCta` plus a new `AboutNavCards`
section — four small `Link` cards (`.marketing-nav-card`) pointing at the four split-out pages, so
`/` and `/about` still surface all of the same content, just one click away instead of a scroll.
`AboutNavCards` reuses the exact cursor-spotlight mechanism already established twice
(`.feature-card`, then the dashboard cards) as its third instance — same `--spot-x`/`--spot-y`
defaults, same `::before` radial-gradient under `pointer: fine`, same `> *` z-index companion rule —
rather than inventing a fourth micro-interaction.

## Decision 2: two new background-mesh techniques, kept deliberately distinct from each other and from the hero

The four split marketing pages now open straight into their `.section-head` with no hero mesh above
them. `.marketing-page-header` gives each a **static** (no `hero-mesh-drift`, no animation at all)
pair of low-alpha radial gradients — a quiet echo of the hero's gradient-mesh language rather than a
repeat of it, since re-running the hero's actual moving mesh on every sub-page would stop reading as
a one-time entry moment and start reading as visual noise. Each of the four pages gets its own
modifier class with different focal points and accent/success/warning token pairings so they don't
read as four identical copies of one background.

Separately, `.dashboard-page`/`.challenges-page`/`.progress-page` get their own even quieter
treatment: lower alpha (~0.05–0.07 vs. the marketing header's ~0.06–0.09), larger/softer radius, and
— just as deliberately — **also static**, for the opposite reason: these are pages a user revisits
constantly, not a one-time landing moment, so an animated wash would become distracting noise on the
tenth visit rather than a delightful surprise on the first. `position: relative; isolation: isolate`
on the page root plus `z-index: -1` on the `::before` keeps the wash behind that page's own cards
without bleeding behind `NavBar` (a separate sibling element, not a descendant of `.page`, so it was
never at risk regardless). Each of the three pages uses a different accent/success/warning pairing
and focal point, same reasoning as the marketing headers. Neither of these two new techniques reuses
the other's exact alpha/radius/positions, and neither reuses the hero's own mesh — three visually
distinct instances of the same underlying idea (soft radial-gradient wash, low-alpha brand tokens),
not one technique copy-pasted three times.

Per `decisions/0021`, no per-category icon mapping was introduced anywhere in this pass —
`.category-tile` and `.challenge-card` are untouched, and the new page washes are page-level, not
per-category.

## Decision 3: help/support is submission-only, no admin concept

`help_requests` (new migration `0003_help_requests.sql`) has exactly `id`, `user_id`, `subject`,
`message`, `created_at` — no `status`, no `role`, no admin flag anywhere in the schema or the API.
`GET /api/help` returns only the calling user's own rows (`WHERE user_id = $1`); there is no route,
anywhere, that lists another user's submissions or mutates a submission's state. This matches the
app's existing authorization model exactly: `requireAuth` has only ever attached `req.userId`, and
this pass didn't introduce a first admin/role concept just to give a support inbox somewhere to
live. If a real triage workflow is ever needed, that's a deliberately separate, larger decision
(likely a genuine admin concept) — not something to back into via an unused `status` column now.
The submit route is rate-limited (`help-submit`, keyed by `req.userId`, default 5/hour) using the
same in-memory fixed-window limiter already used for auth endpoints, for the same reason: a single-
node personal tool with no expectation of needing a distributed limiter.

## Verification

- `npx tsc --noEmit` clean on both `frontend` and `backend`.
- `npm run build` (frontend) clean, no CSS-minifier warnings on any new multi-line comment. Verified
  separate lazy chunks exist in `dist/assets/` for `FeaturesPage`, `HowItWorksPage`,
  `SelfHostingPage`, `FaqPage`, and `HelpPage` — the route split actually produces route-level code
  splitting, not one bundle.
- Grepped the built `dist/assets/index-*.css` and confirmed `.marketing-page-header` (+ its four
  modifiers), `.marketing-nav-card`, `.help-request-item`, and the `.dashboard-page`/
  `.challenges-page`/`.progress-page` `:before` rules all landed in the real bundle (minified to
  `:before`, not `::before`, as expected).
- Grepped all of `frontend/src` for `scrollIntoView`/`getElementById` (zero matches outside
  `main.tsx`'s unrelated root-mount call) and for `href="#features"`/`href="#walkthrough"`/
  `href="#self-host"`/`href="#faq"` (zero matches) — confirms both anchor-scroll copies (`LandingNav`
  and `Hero`) are fully gone, not just one of them.
- `git diff frontend/src/components/NavBar.tsx` was checked and does show a diff — but that diff's
  content (the `/dashboard` brand link, "About"/profile nav links) matches `decisions/0019`/`0020`
  exactly, and the file's mtime predates this pass entirely. `NavBar.tsx` was never opened or edited
  during this pass; the diff is pre-existing uncommitted work from earlier passes, not new.
- Full stack brought up via `docker compose up --build -d` (dev override); `0003_help_requests.sql`
  confirmed applied via `schema_migrations`. A throwaway account was created via the real signup
  API; `POST /api/help` returned `201` with the real row, `GET /api/help` listed it, and the row was
  confirmed directly in Postgres via `psql`. Submitting a 5th and 6th time within the rate-limit
  window returned `429` as configured. The four new marketing routes plus `/help` and `/about` were
  curled through the real production nginx path (a temporary `docker compose -f docker-compose.yml
  up --build -d` without the dev override, to actually exercise the built `dist` + nginx image
  rather than the dev Vite server on `:5173`) and all returned `200` via the existing SPA
  `try_files` fallback — zero nginx config changes needed. The dev-override stack was then restored
  as the steady state per the project's usual "leave it running" convention. The throwaway account
  was deleted afterward; its `help_requests` row count went from 5 to 0 confirming `ON DELETE
  CASCADE`, and `docker ps -a --filter label=app=devops-trainer` was empty throughout.
- No headless browser was available in this environment, so the actual rendered feel (the two new
  background washes, the marketing nav cards' spotlight glow, the textarea styling) was verified by
  reasoning through the CSS and confirming every new class/custom-property reached the real built
  bundle, not a screenshot — the same caveat every design pass on this app has carried.
