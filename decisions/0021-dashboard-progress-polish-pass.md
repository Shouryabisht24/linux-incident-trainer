# 0021 — Dashboard/Progress polish pass: donut-ring technique, no per-category icons, non-interactive category tiles

## Context

`decisions/0019` gave the authenticated app its `/dashboard` home and its `/progress` breakdown
page, sharing the same `useProgress()` query/cache entry so the two pages' numbers can never drift
apart. That pass left `/progress` itself as a flat "one h1 + one card of stacked category rows" —
functional, but visually thinner than the Dashboard it sits next to, and with no reveal/spotlight
treatment at all. This pass brings `/progress` up to the same visual language as the Dashboard
(`Reveal`, the cursor-spotlight card glow, count-up numbers, scroll-gated progress-bar fills) and
gives the Dashboard itself a few of the same touches it was still missing (an animated live-session
indicator, a real empty state for "no active session," per-category mini bars).

Zero new npm dependencies were introduced — every effect below is hand-built in plain CSS custom
properties + inline SVG, consistent with every prior design pass on this app (the theme flip, the
texture pass, the visual-identity pass, decisions/0017–0020).

## Decision: the `--ring-pct` donut ring is a direct extension of the existing `--border-angle` trick

The landing page's hero terminal frame (decisions/0018/0019) already established the pattern of
using `@property` to declare a custom CSS property with a specific animatable syntax
(`--border-angle: <angle>`), so the browser can smoothly interpolate it in a `transition` or
`@keyframes` block instead of needing a JS rAF loop for what's fundamentally a CSS-shaped problem.

`/progress`'s new donut ring (`ProgressRing`, used both as a small per-category indicator and a
larger hero-summary indicator) reuses the identical mechanism, just swapping the animated value
from an angle to a percentage:

```css
@property --ring-pct {
  syntax: "<percentage>";
  inherits: false;
  initial-value: 0%;
}
.progress-ring {
  --ring-pct: 0%;
  background: conic-gradient(var(--color-accent) var(--ring-pct), var(--color-bg-elevated-2) 0);
  transition: --ring-pct 900ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

The ring's `--ring-pct` is only set to its real value once the tile has scrolled into view (gated by
the same `useScrollReveal` hook every other reveal effect on this app uses), so it fills in on
arrival rather than rendering already-full. Reduced-motion users get the existing blanket
`transition-duration: 0.001ms !important` override at the bottom of `styles.css` — no special-case
rule was needed beyond that, since `useScrollReveal` already resolves `visible` to `true`
immediately (no transition to skip) for those users.

## Decision: no per-category icons

Category tiles on `/progress` are data-driven status badges (`badge-status-complete` /
`badge-status-progress` / `badge-neutral`) rather than a hardcoded slug → icon mapping. Categories
are seeded server-side and can change; a static icon map would silently go stale (a new category
gets no icon, or worse, an existing slug gets renamed and its icon mapping quietly breaks). A
color-coded status badge derived purely from `{ total, solved }` has no such failure mode and needs
no maintenance when categories change.

## Decision: category tiles are non-interactive by design, not by oversight

`CategoryTile` renders a plain `<div>` — not a `<Link>`, no hover-lift, no spotlight glow. This was
checked directly against `ChallengeListPage.tsx`: its category filter is local component state
(`const [category, setCategory] = useState<string>("all")`), not a URL search param. A tile linking
to something like `/challenges?category=slug` would navigate to a real route but silently do
nothing once there — the filter wouldn't pick up the query param at all. Rather than build (or
wait for) a URL-param version of that filter just to make these tiles "feel" clickable, they stay
honest about what they are: a read-only status summary. If `ChallengeListPage`'s filter is ever
migrated to a URL param, revisit this — a real deep link would then be a legitimate addition.

## Decision: `.category-tile` is modeled on `.challenge-card`, not `.card`, and deliberately excluded from the texture-grain list

`styles.css` already documents (search `texture-grain`) that the faint grain texture applied to a
handful of large, single-instance-per-page surfaces (the auth card, the dashboard/solution cards,
the landing stats band, feature cards) is deliberately withheld from small tiles repeated many times
per page — the challenge grid is the existing example, called out by name in that comment. The new
`progress-category-grid` is the same shape of problem (up to ten small tiles on one page), so
`.category-tile` gets its own plain border/background/padding block instead of `.card`, and was not
added to the texture-grain selector list, for the same reason: repeated across that many tiles, a
barely-perceptible per-surface accent becomes visible per-tile noise.

## Other changes bundled into this pass

- `Reveal` (`LandingPage.tsx`'s local scroll-reveal wrapper) is promoted into `components/ui.tsx` as
  a shared export, identical signature/behavior. `LandingPage.tsx`'s own local copy is left
  untouched (accepted duplication, out of scope for this pass).
- `.dashboard-card-kicker` is renamed to `.kicker-line` everywhere in `DashboardPage.tsx` and the
  new `ProgressDashboardPage.tsx`, so the `$ <command>` kicker convention reads as one shared idiom
  across both pages. `ProfilePage.tsx` (out of scope for this pass) still uses the old class name
  directly, so `styles.css` keeps `.dashboard-card-kicker` as a comma-selector alias of
  `.kicker-line` rather than dropping it — a full rename would have required touching a third file
  outside this pass's stated scope.
- The live-session dot on the Dashboard's continue-session card gets a `dot-pulse-ring` expanding/
  fading box-shadow animation while `status !== "running"`, so a mid-connecting session is
  visibly, not just semantically (by color alone), distinct from a steady connected one. Explicitly
  disabled under `prefers-reduced-motion` (mirroring how `.hero-terminal-cursor` already gets an
  explicit override there rather than relying solely on the blanket rule).

## Verification

- `npx tsc --noEmit` and `npm run build` both clean; the built `dist/assets/index-*.css` was
  grepped directly to confirm `.progress-ring`, `.category-tile`, `--ring-pct`,
  `.dashboard-continue-card-link`, and `.badge-status-complete` all landed in the real bundle, not
  just the source.
- Full stack brought up via `docker compose up --build -d`; `postgres` healthy, `GET /health` OK.
- A throwaway account was created via `POST /api/auth/signup` and used to fetch `GET /api/progress`
  for real: 50 challenges across the real 10 categories, in the real fixed API order. Every category
  currently has `total > 0` in this seed data — there is no genuinely unseeded (`total: 0`) category
  to exercise that empty-tile copy against live data right now, so that specific path was verified
  by code reading rather than a live API response; if a category is ever added to the DB ahead of
  its challenges being seeded, this is the path that renders for it.
- A real session was started against `perm-config-blocks-service`, the actual permission fix
  (`chmod 755 /var/www/html`, `chmod 644` its index file, then `service nginx start`) was applied
  inside the live container as the unprivileged `trainee` user via `sudo`, and `POST
  /api/sessions/:id/check` passed for real (`nginx is running and serving a successful response on
  port 80`). After stopping the session, `GET /api/progress` and `GET /api/challenges` were both
  re-fetched and agree: `solved: 1`, `permissions-ownership` category at `1/6`, and the specific
  challenge flagged `solved: true` — confirming Dashboard and Progress still can't drift, since nothing
  in this pass touched the query layer.
- The throwaway account's row was deleted from `users` afterward; `docker ps -a --filter
  label=app=devops-trainer` was empty immediately after, confirming no orphaned session container.
- No headless browser was available in this environment, so the actual rendered feel (the ring
  fill-in animation, the spotlight glow on the two new dashboard cards, the category grid's
  small-multiples layout) was verified by reasoning through the CSS and confirming every new
  class/custom-property reached the real built bundle — not a screenshot. A real look in a browser
  is still worth doing, same caveat every design pass on this app has carried.
