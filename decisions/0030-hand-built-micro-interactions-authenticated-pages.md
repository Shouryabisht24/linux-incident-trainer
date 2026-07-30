# 0030 — Hand-built micro-interactions on the authenticated app: tilt, magnetic buttons, shiny-text, click-spark

## Context

react-bits.dev's "UI Elements" category (tilt cards, magnetic buttons, shiny text, click sparks) is a well-known
catalog of small, delightful hover/click interactions built as installable React components. This pass borrows the
*ideas* only — every effect is hand-built in plain CSS custom properties + a handful of pure DOM-mutation functions,
zero new npm dependencies, consistent with every prior design pass on this app (the spotlight glow, the donut ring,
the celebration banner). The four effects are restrained and scoped to specific elements rather than applied
app-wide, matching this project's repeatedly-established "precision over quantity" ethos (decisions/0021, 0023).

## Decision: the transform-collision-avoidance technique, and why it mattered

Every card/button in this app that already had a `:hover`/`:focus-visible` rule also sets `transform` there (e.g.
`.challenge-card:hover { transform: translateY(-5px); }`). Separately, the scroll-reveal entrance
(`.reveal`/`.reveal.is-visible`) *also* sets `transform` on many of the same elements during mount
(`translateY(18px)` → `translateY(0)`). Declaring a second, independent resting-state `transform` for tilt (e.g. a
bare `.dashboard-progress-card { transform: rotateX(...); }` outside any pseudo-class) would put two `transform`
declarations at equal specificity on the same element at rest, and whichever wins the cascade silently discards the
other's effect entirely — the exact "two selectors cancel each other out" trap decisions/0024 already documented for
`.final-cta-section`'s padding bug.

The fix applied everywhere in this pass: `--tilt-x`/`--tilt-y` (cards) and `--magnet-x`/`--magnet-y` (buttons) are
**only ever consumed inside an element's existing `:hover`/`:focus-visible`/`:hover:not(:disabled)` rule**, extending
its current `transform` value in place (e.g. `.challenge-card:hover { transform: perspective(800px) rotateX(var(
--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) translateY(-5px); }`) — never as a new bare resting-state `transform`
declaration. Since hover/focus only ever happens after an element has already settled out of its reveal animation,
this sidesteps the collision entirely: at rest, only `.reveal`/`.reveal.is-visible` ever sets `transform`; on hover,
only the (now-extended) hover rule does, and it already reliably wins the cascade today (that's exactly why
`.challenge-card:hover`'s pre-existing `translateY(-5px)` already overrides `.reveal.is-visible`'s `translateY(0)`
on hover, unchanged by this pass). Every `var(--tilt-x, 0deg)`/`var(--magnet-x, 0px)` also carries its own zero
fallback, so elements that never get a JS handler wired to them (e.g. `.challenge-card` instances rendered by
`DashboardPage.tsx`'s `RecommendedSection`, which reuses the class but not the handler) just keep today's plain lift
— no new default custom-property declaration was needed anywhere to make that safe.

Verification for this specific risk: grepped `styles.css` for every `transform:` line after the pass and confirmed
each new/extended one sits inside a `:hover`/`:hover:not(:disabled)` selector — none is a bare resting-state rule.

## Decision: touch/`pointer: fine` gating done in JS, not CSS, for tilt/magnet

The existing spotlight-glow mechanism gates its own separate `::before` pseudo-element layer inside
`@media (pointer: fine)` — clean, because that glow lives in a dedicated layer with nothing else attached to the
same selector. Tilt and magnet, by contrast, live *inside* an existing, otherwise-ungated hover rule (the base
`translateY`/`scale(0.97)` lift on `.challenge-card`/`.btn-primary`/etc. was never itself `pointer: fine`-gated, and
touching that now would risk exactly the kind of "wrap the whole selector in a media query and accidentally
duplicate/diverge it" mistake this pass is trying to avoid). Instead, `handleTiltMove`/`handleMagnetMove` bail out in
JS (`if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;`) before ever setting a custom property, so a
touch tap can never leave a stale tilt/magnet value sitting around for a simulated `:hover` state to pick up — the
same end result as the CSS gate (no visual engagement on touch), reached the way that's actually safe given where
each effect is consumed. Kept consistent across all three effects: spotlight stays CSS-gated (unchanged), tilt and
magnet are both JS-gated the same way.

## Exactly which elements got which effect

- **Tilt** (`--tilt-x`/`--tilt-y`, `perspective(800px) rotateX(...) rotateY(...)` layered onto the existing hover
  transform): `.challenge-card` (`ChallengeListPage.tsx`'s `ChallengeGrid` — covers `DashboardPage.tsx`'s
  `RecommendedSection` by class reuse, no handler wired there per the brief), `.dashboard-continue-live` and
  `.dashboard-progress-card` (`DashboardPage.tsx` — combined into the existing `handleSpotlightMove` function rather
  than a second `onPointerMove` prop, since React only keeps the last one assigned; `.dashboard-progress-card` had no
  hover state at all before this pass, so its hover rule — border-color + box-shadow bloom — is new, modeled
  verbatim on its sibling `.dashboard-continue-live:hover` for consistency), `.profile-card` (`ProfilePage.tsx` — all
  three cards: display name, change password, delete account; also had no hover state before this pass, modeled on
  `.feature-card:hover`'s two-layer-shadow-plus-lift recipe, scaled down for this page's quieter register).
  `.profile-danger-card` inherits the lift/tilt/shadow from `.profile-card:hover` by class composition, plus its own
  smaller `.profile-danger-card:hover { border-color: ...danger, 0.55... }` override (source-order-wins single
  property tweak, not a second transform) so it intensifies its existing red border instead of switching to accent
  teal. `.category-tile` was explicitly **not** touched — it stays a plain, non-interactive `<div>` per decisions/0021
  ("category tiles are non-interactive by design, not by oversight" — `ChallengeListPage`'s category filter is local
  `useState`, not a URL param, so a hover-lift implying clickability would be dishonest about what the tile actually
  does).
- **Magnetic-pull** (`--magnet-x`/`--magnet-y`, `translate(...)` layered onto the existing hover transform, capped at
  ±6px): `.btn-primary` on Save display name / Change password (`ProfilePage.tsx`) and Start Challenge / Check My Fix
  (`ChallengeDetailPage.tsx`); `.btn-danger` on the one delete-account button (`ProfilePage.tsx`) — `.btn-danger` had
  no hover transform before this pass, added a small matching lift + magnet since it's the one interactive element on
  that card getting this treatment.
- **Shiny-text sweep** (`.count-shine`/`.text-shine`, identical mechanism, two names so it reads naturally on both
  numeric and prose content): `DashboardPage.tsx`'s `ProgressSnapshotCard` and `ProgressDashboardPage.tsx`'s summary
  card, both on the solved-count `<span className="tabular">`; `Celebration.tsx`'s milestone title. Deliberately
  **not** applied to any other `.tabular` number in the app (there are many — sweeping all of them would be noise,
  not a considered accent).
- **Click-spark** (hand-built DOM+CSS burst, no canvas): only `ChallengeDetailPage.tsx`'s "Start Challenge" and
  "Check My Fix" buttons — this app's actual core interaction loop. `spark()` checks `useReducedMotion()` directly
  before creating any DOM node (belt-and-suspenders alongside the blanket reduced-motion CSS override, same pattern
  `HeroTerminal`'s reveal loop already uses). A new `.btn-spark-host` class (not the shared `.btn` base, to avoid
  touching every button in the app) gives just these two buttons `position: relative` so the absolutely-positioned
  `.click-spark` spans land relative to the button itself.

## Ambient backgrounds and `.category-tile` — confirmed untouched

`git diff`-equivalent review (no VCS in this checkout, so a direct re-read) confirms zero lines changed near
`.category-tile` (`styles.css`, modeled on `.challenge-card`, decisions/0021) or `.dashboard-page::before` /
`.challenges-page::before` / `.progress-page::before` (the ambient hover/click-triggered-only constraint for this
pass, decisions/0021 and 0027) — both were read in full to confirm the exclusion before writing any CSS, not just
assumed.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, no CSS-minifier warnings; grepped every new multi-line CSS comment for a stray `*/`
  (none — the exact mistake that broke an earlier pass, per decisions/0023's own verification note).
- Grepped the built `dist/assets/index-*.css`: `.count-shine`, `@keyframes count-shine`, `.text-shine`,
  `.click-spark`, `@keyframes click-spark-burst`, `.btn-spark-host`, and every extended `:hover`/
  `:hover:not(:disabled)` transform value (`perspective(800px) rotateX(var(--tilt-x...` for `.challenge-card`,
  `.dashboard-continue-live`, `.dashboard-progress-card`, `.profile-card`; `translate(var(--magnet-x...` for
  `.btn-primary`, `.btn-danger`) all landed in the real bundle, not just the source.
- Curled the live `:5173` dev server directly for every changed file (`DashboardPage.tsx`, `ChallengeListPage.tsx`,
  `ProfilePage.tsx`, `ChallengeDetailPage.tsx`, `ProgressDashboardPage.tsx`, `Celebration.tsx`, `ui.tsx`,
  `styles.css`) and grepped the response bodies for the new identifiers (`handleTiltMove`, `handleMagnetMove`,
  `btn-spark-host`, `count-shine`, `text-shine`, `onPointerLeave`) — confirms Vite is serving the real edits, not a
  stale build.
- Re-read every CSS rule touched specifically to confirm the collision-avoidance rule held: grepped every
  `transform:` line in `styles.css` after the pass and traced each one back to its enclosing selector — every
  new/extended one sits inside `:hover`/`:hover:not(:disabled)`; none is a bare new resting-state rule.
- `docker compose ps` — all three services healthy (`postgres` healthy, `backend`/`frontend` up); no backend changes
  in this pass, so no rebuild was needed. Left the dev-override stack running as the steady state.
- **No headless browser available in this environment** — the actual rendered feel (the tilt angle at various
  cursor positions, the magnet pull's responsiveness, the shiny-text sweep's "mostly still, occasionally sweeps"
  timing, the click-spark burst's shape/color against the button background) was verified by careful reading of the
  exact CSS/JS, not a visual check — same honest caveat every design pass on this app has carried.
