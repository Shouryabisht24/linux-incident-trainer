# 0032 — `styles.css` dead-code cleanup pass

## Context

`frontend/src/styles.css` had grown to 3940 lines across roughly 15 additive design passes (light-theme flip,
visual-identity pass, several marketing-page redesigns, dashboard/progress restructures, micro-interactions,
animation-intensity bumps). Several of those passes explicitly left old rules in place when a component was
redesigned and stopped using them, on the reasoning "deleting isn't required, nothing else references it" — this
file's own task history calls out `.category-row` as one such case, and an old `.code-block` component as another.
The task: actually find and remove everything genuinely dead, without breaking anything that's still live.

## The core risk, and how it was handled

A naive `grep -rn 'className="foo"'` would miss real usages in this codebase, since several components build class
names dynamically:

- `` className={`dot dot-${terminalStatus}`} `` (`ChallengeDetailPage.tsx`) / `` `dot dot-${session.status === "running" ? "connected" : "connecting"}` `` (`DashboardPage.tsx`)
- `` className={`toast toast-${t.kind}`} `` (`ToastContext.tsx`, `ToastKind = "success" | "error" | "info"`)
- `` className={`progress-ring progress-ring--${size}`} `` (`ProgressDashboardPage.tsx`, `size: "sm" | "lg"`)
- `` className={`chip${checked ? " chip-active" : ""}` `` (`ChallengeListPage.tsx`)

An exact-string search for `.dot-connected`, `.toast-error`, `.progress-ring--lg`, etc. finds **zero** matches for
every one of these, even though all of them are genuinely rendered at runtime. The method used instead: extract
every class-like selector out of `styles.css` (298 raw tokens, ~286 after stripping obvious non-class noise picked
up from an SVG data-URI and prose), then for each one, grep the bare name as a **substring** across the whole
`frontend/src/` tree (not just `.tsx`, not just literal `className="..."`). For every one of those, the shorter
base name (`dot`, `toast`, `progress-ring`, `chip`) turned out to be present as a literal token in the template
literal itself, which is enough to prove the full family of suffixed variants is genuinely wired up — then the
component's own type (`TerminalStatus`, `ToastKind`, the `size` prop's union type) was read directly to confirm
every specific suffix used in CSS (`connecting`/`connected`/`disconnected`, `success`/`error`/`info`, `sm`/`lg`) has
a real caller, not just that *some* suffix does.

A fast batch pre-filter (one `grep -rohF -f patterns.txt` pass building the candidate list, instead of one grep
process per class) was used first to keep the sweep tractable, then every batch-reported "no match" was re-verified
one at a time with a direct, targeted grep — because grep's leftmost-longest matching rule means a shorter pattern
(e.g. `progress-summary`) can be silently swallowed by a longer sibling pattern that starts at the same text
position (e.g. `progress-summary-card`) and never get reported as its own match in a single batched alternation,
even though the substring is genuinely present. Every one of the 14 batch "unmatched" candidates was individually
re-checked with its own grep call before being trusted either way.

## What was removed

1. **`.category-row` / `.category-row:last-child` / its `@media (max-width: 640px)` override** (~18 lines total).
   Confirmed dead — zero references anywhere in `frontend/src/`. This is the already-known candidate from the
   Progress dashboard's decisions/0021 restructure (superseded by `.category-tile`); this pass just executed the
   deletion that earlier note deferred.
2. **`.progress-summary` / `.progress-summary .big`** (~11 lines). Found via the systematic sweep, not on the
   task's seed list. `.progress-summary` (bare) and `.big` never appear as literal tokens anywhere in
   `frontend/src/` outside `styles.css` itself — not even embedded in an unrelated word, confirmed with an
   unbounded substring grep. This was the pre-restructure Progress dashboard's own top-level rule (the "one h1 +
   stacked rows" flat layout the file's own comment block references); it's fully superseded by
   `.progress-summary-card`/`.progress-summary-stats`/`.progress-summary-primary`/`.progress-summary-secondary`,
   which are separately declared, independently styled selectors — not `.progress-summary` extended via
   combinator, so removing the old rule doesn't touch the new one at all.
3. **`.terminal-wrap-inner`** (~5 lines). `TerminalPane.tsx` renders its xterm container with a plain inline
   `style={{ height: "100%", width: "100%", ... }}` object; nothing anywhere sets this className. `.terminal-wrap`
   (the outer chrome around it) is untouched and still very much alive.

Total: 38 lines removed (3940 → 3902), all three confirmed dead by direct component inspection, not inference.

## What was already handled by a prior pass

The task brief's other seed candidate, `.code-block`, is **not present in `styles.css` at all** — decisions/0025
already deleted it (along with its YAML-specific siblings `.compose-key`/`.compose-value`/`.compose-line`/
`.compose-indent-1..4`/`.compose-panel-badge`) when `InstallPanel` replaced the old `ComposePanel`. Nothing left to
do there; confirmed by reading decisions/0025 directly rather than assuming.

## What was checked and found NOT dead

- All 14 `@keyframes` blocks are referenced by at least one `animation:`/`animation-name:` property in the file.
- Every `:root` custom property has at least one real consumer. Notably `--term-mock-warning` has **zero**
  `var()` references inside `styles.css` itself, but is consumed via inline `style={{ background:
  "var(--term-mock-warning)" }}` in `LandingPage.tsx`/`NotFoundPage.tsx`, and via a `token("--term-mock-warning")`
  JS helper in `TerminalPane.tsx` — a genuine near-miss that a CSS-only grep would have flagged as an orphan.
  Per the task's explicit constraint, every `--color-*`/`--font-*`/`--space-*`/`--radius-*` design token was left
  untouched regardless of how lightly used any individual one looked — that token system was declared out of
  scope for a dead-code-only pass, deliberately.
- Several bare/short class names that looked like plausible leftovers at a glance, each individually traced to a
  real, direct caller and kept: `.hero` (bare — `LandingPage.tsx`'s hero wrapper div, distinct from its many
  `.hero-*` siblings), `.dashboard-continue-card` (bare — the outer `Reveal` wrapper in `DashboardPage.tsx`,
  distinct from `.dashboard-continue-card-link`), `.chip`/`.dot`/`.toast` (all bare template-literal base classes,
  covered above), `.select-field` (`ChallengeListPage.tsx`'s category-filter label), `.dashboard-card-kicker`
  (still directly referenced in `ProfilePage.tsx`, exactly as the file's own comment says, alongside `.kicker-line`
  which the in-scope Dashboard/Progress pages use instead — kept as a documented alias, not touched).

## Verification

`npx tsc --noEmit` clean (unaffected by a CSS-only change, confirmed rather than assumed). `npm run build` clean,
no CSS-minifier warnings. Built CSS bundle: `dist/assets/index-*.css` 60,710 → 60,186 bytes (−524 bytes);
`dist/assets/ChallengeDetailPage-*.css` unchanged at 4,150 bytes, since none of the three removed rules lived in
that split chunk. Curled the live `:5173` dev server's `/src/styles.css` module and grepped the response body for
`category-row`, `terminal-wrap-inner`, and a bare `.progress-summary {` — zero matches in all three, confirming
Vite is serving the actual edit rather than a stale cached copy, while `progress-summary-card`, `category-tile`,
and `terminal-touch-row` (all still-live selectors near the removed ones) remained present in the same response.
Re-ran the substring grep for every removed selector across `frontend/src/` one final time after all edits landed
— still zero matches — and re-checked that removing these three didn't orphan any keyframe or custom property as a
side effect (none of the three rules referenced a keyframe; their only custom-property references were core
`--space-*` tokens still used everywhere else in the file). `docker compose ps` — all three services healthy; no
backend changes, no rebuild needed. Left the dev-override stack running as the steady state.
