# 0031 — Animation intensity pass: the same hero/nav-card techniques, made unmistakably more present

## Context

The About page (`/` and `/about`, `LandingPage.tsx` + `MarketingLayout.tsx`) has been through 5+ design passes and
already has five real animated techniques: the `.hero-bg` ambient gradient-mesh drift, the `.hero-terminal-frame`
`@property --border-angle` conic-gradient ring, `AboutNavCards`' cursor-spotlight-glow cards, the hero's
character-by-character transcript reveal, and the stat tiles' count-up. The user asked for "cool animations" again
despite all of this existing work. When asked whether they wanted something new or a bolder version of what's there,
they chose **bolder version of existing techniques**.

This project has hit the identical problem multiple times before and each time the fix was the same — not a new
technique, just turning up a value that was tuned too conservatively:

- decisions/0024 shipped the hero mesh drift and the border-angle ring at what it called "genuinely bold presence,"
  and separately shipped the spotlight glow at 360px/0.13 alpha under an explicit "precision over quantity" ethos.
  Both were still read by the user as "no change at all" or too faint to register.
- decisions/0026 bumped the hero-bg alphas and enriched the ring's color sweep, and is directly quoted in
  `styles.css`'s own comments as fixing a prior pass "which the user twice reported as reading like no change at
  all."

Same lesson as this project's gradient-text-headline-contrast and texture-alpha precedents: restraint doesn't land
with this user; escalate decisively instead of nudging by 10%. This pass makes each of the five existing techniques
more pronounced. **No sixth technique was added** — every change below is a numeric tuning of an existing rule.

## Exactly what was tuned, and by how much

All in `frontend/src/styles.css` unless noted.

1. **`.hero-bg` ambient mesh drift** (`@keyframes hero-mesh-drift`, first tuned in decisions/0024, alphas bumped in
   decisions/0026):
   - Cycle duration: `28s` → `12s` (57% faster).
   - Movement range: `translate3d(-1.5%, 1%, 0) scale(1.02)` → `translate3d(-4%, 2.5%, 0) scale(1.06)` at the 50%
     keyframe (roughly 2.5-3x the translate distance, 3x the scale delta).
   - Gradient stop alphas: accent `0.3` → `0.44`, violet `0.26` → `0.4`, rose `0.22` → `0.36`, dot-grid texture
     `0.05` → `0.09`.

2. **`.hero-terminal-frame`'s `--border-angle` conic-gradient ring** (decisions/0024's "signature element" upgrade):
   - Spin duration: `7s` → `3.5s` (2x faster).
   - Visible arc: the fully-transparent gap narrowed from 10% of the circle (`transparent 50%, transparent 60%`) to
     4% (`transparent 52%, transparent 56%`) — more of the ring reads as lit at any given instant.
   - Stop opacities: accent `0.75` → `0.92`, violet `0.6` → `0.78`, rose `0.5` → `0.68`.

3. **`AboutNavCards`' cursor-spotlight glow** (`.marketing-nav-card::before`, decisions/0024's "precision over
   quantity" pass at 360px/0.13):
   - Radius: `360px` → `520px` (44% larger).
   - Alpha: `0.13` → `0.24` (85% higher).
   - Implementation note: this radial-gradient background was declared once for a shared selector list
     (`.feature-card`, `.dashboard-continue-live`, `.dashboard-progress-card`, `.marketing-nav-card` all share one
     `::before` rule). Bumping it in place would have also changed `/features` and the authenticated Dashboard cards,
     both explicitly out of scope for this About-page-only pass. Instead, a second `@media (pointer: fine) {
     .marketing-nav-card::before { background: ...; } }` rule was added immediately after the shared block —
     identical specificity, later in source order, so it wins the cascade for just `.marketing-nav-card` and leaves
     the other three selectors at their original 360px/0.13 value.

4. **Hero character-by-character transcript reveal** (`HERO_REVEAL_MS_PER_CHAR`, `LandingPage.tsx`, originally tuned
   in decisions/0018):
   - `6ms`/char → `14ms`/char (total playback for this transcript's 470 characters: `~2.8s` → `~6.6s`).
   - Reasoning: at 6ms/char (~166 chars/sec) and a 110ms per-character opacity fade, roughly 18 characters are
     mid-fade at any instant — the reveal read as a soft blurred wipe sweeping across the block rather than a
     perceivable typing cadence. 14ms/char keeps well under half as many characters mid-fade at once, so the
     progressive character-by-character reveal is now something you can actually watch happen, not just something
     that's technically true if you check the DOM.

5. **Stat tile count-up** (`StatTile`, `LandingPage.tsx`, `useCountUp`'s `easeOutQuint` curve):
   - Base duration: `1200ms` → `2200ms` (the per-tile stagger offset, `i * 220ms`, is unchanged, so the three tiles
     now finish at 2200/2420/2640ms instead of 1200/1420/1640ms).
   - Reasoning: `easeOutQuint` front-loads its motion — at 1200ms, most of the visible count-up was over within a
     few hundred milliseconds, reading closer to a jump-cut than a climb. 2200ms leaves enough of the curve's slower
     tail visible to actually watch the numbers climb.

## What was deliberately NOT touched

- No new `@keyframes` block, no new CSS custom property, no new JS animation loop — every change above is a
  parameter tuned on a rule that already existed before this pass.
- `/features`, `/how-it-works`, `/self-hosting`, `/faq` and all authenticated pages — untouched. The one place a
  shared rule would have leaked a change onto `/features`/Dashboard (`AboutNavCards`' spotlight glow) was
  specifically isolated via a scoped override rather than edited in place; see item 3 above.
- `.feature-card`, `.dashboard-continue-live`, `.dashboard-progress-card` — confirmed still render the original
  360px/0.13 spotlight glow after the change (grepped the built CSS for both the shared rule and the new
  `.marketing-nav-card`-only override; both are present and distinct).
- The reduced-motion override block at the end of `styles.css` was re-checked, not just assumed intact:
  `.hero-bg { animation: none; }`, `.hero-char { opacity: 1 !important; transition: none !important; }`, and the
  blanket `* { animation-duration: .001ms !important; animation-iteration-count: 1 !important;
  transition-duration: .001ms !important; }` at the very end all still cover every effect touched here — the
  border-angle ring's now-faster `hero-frame-spin` animation and the mesh drift's now-larger movement range are both
  frozen by these existing rules exactly as before, no new gap was introduced. The count-up's duration change is
  irrelevant under reduced motion since `useCountUp` jumps straight to the target value for `useReducedMotion()`
  users regardless of the `durationMs` argument. The character-reveal timing change is likewise moot under reduced
  motion since `HeroTerminal` skips the reveal loop entirely and marks every character revealed synchronously when
  `useReducedMotion()` is true.

## Verification

- `npx tsc --noEmit` and `npm run build` (frontend) — both clean, no CSS-minifier warnings.
- Curled the live `:5173` dev server directly for `styles.css` and `LandingPage.tsx` and grepped the response bodies
  for every changed value (`hero-mesh-drift 12s`, `translate3d(-4%, 2.5%, 0) scale(1.06)`, the four new alpha
  values, `hero-frame-spin 3.5s`, the narrowed transparent gap, the three new ring opacities, `520px circle at
  var(--spot-x)`, `HERO_REVEAL_MS_PER_CHAR=14`, `2200 + staggerMs`) — confirmed Vite serves the real edits, not a
  stale cache.
- Grepped the built `dist/assets/index-*.css` and `dist/assets/LandingPage-*.js`: every value above is present in
  the production bundle (the minifier renamed `HERO_REVEAL_MS_PER_CHAR` to a single-letter binding but its value,
  `14`, is unchanged; the count-up base duration survives minification as the literal `2200+r`).
- Re-confirmed the shared `.feature-card`/`.dashboard-*`/`.marketing-nav-card` spotlight rule still declares its
  original `360px`/`0.13` values in the built CSS, immediately followed by the new `.marketing-nav-card`-only
  `520px`/`0.24` override — both present, confirming the scoping actually worked rather than silently overwriting
  the shared rule.
- Re-read the reduced-motion block at the end of `styles.css` line by line after all edits landed: every selector
  this pass touched is still covered (directly or via the blanket `animation-duration`/`transition-duration`
  override), nothing new was left unguarded.
- **No headless browser available in this environment.** The actual rendered feel — how fast the mesh genuinely
  looks "alive," whether the ring's arc reads as continuous motion, how the wider/brighter spotlight looks under a
  real cursor, the perceived cadence of the slowed-down typing effect, how watchable the slower count-up actually
  is — was verified by careful reading of the exact CSS/JS values and the arithmetic behind them (character counts,
  frame timing, opacity-fade overlap), not a visual check. Stated here honestly, same caveat every prior design pass
  on this app has carried.
- `docker compose ps` — all three services (`postgres`, `backend`, `frontend`) still healthy; no backend changes in
  this pass, no rebuild needed. Left the dev-override stack running as the steady state.
