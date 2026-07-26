# 0026 — Bold multi-hue gradient palette for the marketing/landing page family

## Context

`decisions/0024` applied Arc.net-inspired techniques (gradient-mesh washes, layered card shadows,
gradient-clipped headlines) to the six marketing routes, but deliberately reused only the existing
teal `--color-accent` at low opacity, per the user's own instruction at the time: "Arc's techniques,
this app's identity — no new accent colors." The user has since looked at the result twice and
reported "I can't see this" / "not implemented yet" both times.

This was independently verified as **not** a delivery or caching bug: the dev server's response for
`/src/styles.css` returns `Cache-Control: no-cache` with a fresh `Etag`/`Date`, and the classes and
rule bodies genuinely reach the page. The real problem is that a single muted hue at low opacity,
against this app's mostly-neutral light palette, is inherently too subtle to register as "an Arc-
style pass" at a glance — no amount of further opacity tuning on one hue fixes that; it needed more
color, not a bigger number on the same color.

Asked directly how far to push it, the user explicitly lifted the "no new hues" constraint for this
pass only, for gradient/glow purposes: *"Go bolder — real color, real vividness. Allow new colors/
gradient stops beyond the current teal-only palette... a real departure from the current restrained
identity, not a tuning pass."*

## The new palette: grounded in developer terminal/editor themes, not arbitrary

Two new decorative-only tokens were added to `:root`, each with a paired `-rgb` channel token for
this file's existing `rgba(var(--x-rgb), alpha)` idiom:

```
--color-gradient-violet: #6d4aff;   /* rgb(109, 74, 255) */
--color-gradient-violet-rgb: 109, 74, 255;
--color-gradient-rose: #c22a80;     /* rgb(194, 42, 128) */
--color-gradient-rose-rgb: 194, 42, 128;
```

The reasoning is subject-appropriate, not decoration for its own sake: this app's existing
`--color-accent` (#0e7490, a deep signal-teal) was already chosen in `decisions/0018` because it's
"the ANSI hue conventionally used for paths/prompts/hostnames in terminal color schemes." Extending
that same logic, the specific violet + rose pairing added here mirrors the exact teal+violet+pink
triad found in the most popular real developer terminal/editor themes — Dracula (its signature
purple + pink alongside cyan), Tokyo Night (blue/cyan + magenta/purple), and Catppuccin (mauve/pink
alongside teal/sky) all pair a cyan/teal with a violet and a rose/magenta as their headline accent
colors. For an audience of people who spend their day looking at `journalctl`/`systemctl`/`ps` output
in exactly these color schemes, "the app suddenly looks like a well-themed terminal" is a genuine,
on-brand reason to see bold color — not an arbitrary palette swap.

## Contrast — computed via the WCAG relative-luminance formula, not eyeballed

Following this project's established methodology (`decisions/0017`, `0018` — the sRGB-linearize +
`0.2126/0.7152/0.0722` relative-luminance formula, run as a small Python script rather than assumed):

| Pair | Ratio |
|---|---|
| `--color-gradient-violet` (#6d4aff) on `--color-bg-elevated` (#ffffff) | **5.15:1** |
| `--color-gradient-violet` (#6d4aff) on `--color-text` (#171a23) | **3.37:1** |
| `--color-gradient-rose` (#c22a80) on `--color-bg-elevated` (#ffffff) | **5.33:1** |
| `--color-gradient-rose` (#c22a80) on `--color-text` (#171a23) | **3.26:1** |
| (reference) `--color-accent` (#0e7490) on `--color-bg-elevated` | 5.36:1 |
| (reference) `--color-accent` (#0e7490) on `--color-text` | 3.24:1 |

Both new hues were iterated against several candidates (from a lighter/brighter `#6d4aff`-family
violet down to darker `#4f2ab8`, and from `#d6368f`-family rose down to darker `#9e1b68`) specifically
to land close to `--color-accent`'s own two numbers above, for two reasons:

1. **>=5:1 against white** clears WCAG AA for normal text with real margin — legible as actual text
   when clipped into `.gradient-heading`, not merely "pretty as a background tint." A pastel
   violet/pink would have failed this outright.
2. **~3.2–3.4:1 against `--color-text`** matters because these hues are gradient *partners* to
   `--color-text` in `.gradient-heading`'s 3-stop gradient, not standalone text. The prior pass's own
   post-mortem (`tasks.md`, "gradient-heading contrast fix") found that `--color-accent-hover` at
   ~2.3:1 from `--color-text` was *invisible* as a gradient stop — too little luminance separation
   from the adjacent stop reads as a flat color, not a gradient. `--color-accent` itself, at 3.24:1,
   is the value that actually worked. Both new hues were tuned to sit in that same ~3.2–3.4:1 band
   from `--color-text`, so the upgraded 3-stop gradient reads as a real, visible progression instead
   of repeating the same "invisible gradient" failure mode with new colors.

`--color-gradient-rose` (#c22a80, a saturated magenta) was also checked against this app's two
existing semantic reds/ambers to confirm it doesn't read as an error/warning state: `--color-danger`
is #c62e2e (muted brick red, hue ~2°) and `--color-warning` is #9a6100 (dark amber, hue ~38°); rose
sits at hue ~322° (true magenta/pink) — visually and numerically distinct from both, not a
near-miss.

## Where the new hues are allowed — and explicitly are not

**Allowed** (all in `frontend/src/styles.css`):
- `.hero-bg` (landing/about hero gradient-mesh wash) — now a genuine teal+violet+rose triad at
  0.22–0.30 alpha per stop, up from the old accent/success/warning triad at 0.11–0.18.
- The four `.marketing-page-header--*` modifiers (`/features`, `/how-it-works`, `/self-hosting`,
  `/faq`) — each reworked into its own 3-stop teal/violet/rose weighting and focal-point
  arrangement (features: teal-led; how-it-works: violet-led; self-hosting: rose-led; faq:
  violet-led, mirrored) so the four read as a cohesive family with individual character, not four
  copies of one wash — continuing the pattern the prior pass already started, just bolder and now
  genuinely multi-hue instead of swapping among the same accent/success/warning trio every time.
- `.gradient-heading` — upgraded from a 2-stop `--color-text` → `--color-accent` gradient to a real
  3-stop `--color-text` → `--color-gradient-violet` → `--color-gradient-rose` progression.
- `.hero-terminal-frame`'s conic-gradient moving-border ring — enriched from a two-hue
  accent/success sweep to a teal → violet → rose sweep. Same single animation mechanism (no new
  animation technique added), just a richer color pass through it.
- `.feature-card`/`.marketing-nav-card` hover glow — the shadow "bloom" layer now blends two of the
  three hues instead of accent-only, and the pairing **rotates by card position**
  (`:nth-child(3n+1)` = teal+violet, `:nth-child(3n+2)` = violet+rose, `:nth-child(3n)` = rose+teal)
  so a full grid of cards cycles through the whole triad on hover rather than every card glowing
  the identical single color. `.marketing-nav-card`'s cards sit one DOM level inside their `Reveal`
  wrapper (unlike `.feature-card`, which the `Reveal` component renders as the card element
  directly), so its rotation is expressed via `.marketing-nav-grid > *:nth-child(3n+2)
  .marketing-nav-card:hover` (targeting the grid's direct children — the wrapper divs — rather than
  the card itself) rather than a plain `:nth-child` on the card; both selector forms land at equal
  (0,4,0) specificity, safely above the (0,2,0) base hover rules.

**Not allowed** (unchanged, verified untouched): `.btn-primary`/`.btn-ghost` and every other button
variant, `a`/`.landing-nav-links a`/`.nav-link`, `.eyebrow` and `.section-kicker`'s prompt tint,
`.brand-mark` traffic-light dots, `.feature-card-tab-perm-x`, any `--color-success`/`--color-danger`/
`--color-warning` usage, and all focus-visible outlines — all still exclusively `--color-accent` (or
the pre-existing semantic tokens), exactly as before this pass.

## Typography — pushed further for presence

The hero H1's `clamp()` ceiling moved `4rem` → `4.5rem`, and its slope steepened `3.2vw` → `3.6vw` so
it grows in faster through tablet/laptop widths, not just at the very top; the floor (`2.25rem`) is
untouched. Letter-spacing tightened `-0.025em` → `-0.03em` to match the larger ceiling.
`.landing .section-head h2` (the shared rule behind every page-defining `<h2>` that also carries
`.gradient-heading`) got the same treatment: ceiling `2rem` → `2.35rem`, weight `700` → `800`,
tracking `-0.01em` → `-0.015em`. Computed the resulting sizes at 320/360/400px to confirm mobile
safety wasn't regressed: hero H1 lands at 36–38.4px and the section h2 at 24–24.8px across that
range — both within a hair of their pre-pass values at the same widths (the old formula gave 36px at
360px; the new one gives 37px), not a meaningful jump at narrow viewports, all of the actual growth
happening at >=768px.

## Verification

- `npx tsc --noEmit` — clean, no output.
- `npm run build` — clean, no CSS-minifier warnings.
- Grepped the built `dist/assets/index-*.css`: confirmed `--color-gradient-violet: #6d4aff` and
  `--color-gradient-rose: #c22a80` present verbatim in `:root`; `.gradient-heading`'s `@supports`
  rule now reads `linear-gradient(135deg,var(--color-text) 0%,var(--color-gradient-violet)
  55%,var(--color-gradient-rose) 100%)`; `.hero-bg`'s three colored radial stops are
  `rgba(var(--color-accent-rgb),.3)` / `rgba(var(--color-gradient-violet-rgb),.26)` /
  `rgba(var(--color-gradient-rose-rgb),.22)`; all four `.marketing-page-header--*` modifiers carry
  their new 3-stop triads; the `.feature-card`/`.marketing-nav-card` `:nth-child(3n+2)`/`:nth-child(3n)`
  hover-glow overrides are present with the expected violet/rose/accent pairings;
  `.hero-terminal-frame`'s conic-gradient now sweeps accent → violet → rose.
- **Critical check per the user's repeated "I can't see it" reports — verified against the actual
  running dev server, not just `dist/`.** `curl -sD - http://127.0.0.1:5173/src/styles.css` returns
  `HTTP/1.1 200`, `Cache-Control: no-cache`, a fresh `Etag`/`Date` (Vite's dev-transform response, a
  `text/javascript` module wrapping the CSS as a string — this is the live-transformed source the
  `:5173` dev-override stack actually serves, confirmed distinct from a static built asset). Grepped
  that live response directly: both new hex values, both new `-rgb` tokens (9 and 11 occurrences
  respectively — every gradient/glow rule that references them), the 3-stop `.gradient-heading`
  `@supports` block, and the enriched `.hero-bg`/`.marketing-page-header--*` rules are all present
  verbatim in what the dev server actually returns right now.
- Computed every contrast ratio above via the WCAG relative-luminance formula (script run, not
  eyeballed) — table above.
- `docker compose ps` — all three services `Up`/`Up (healthy)` (dev-override stack already running
  from a prior session). `curl`'d all six marketing routes plus the backend health check directly
  against the running stack: `/`, `/about`, `/features`, `/how-it-works`, `/self-hosting`, `/faq`
  (all via `:5173`) and `:4000/health` all returned `200`. No rebuild/restart needed — the dev
  override bind-mounts `frontend/src` and Vite hot-reloads source edits directly. Left running as
  the steady state.
- **No headless browser is available in this environment** (same caveat as every prior visual pass
  on this project) — the actual rendered look was verified by reasoning through the exact CSS values
  and confirming every new/changed rule reached both the built bundle and, critically this time, the
  live `:5173` dev-server response byte-for-byte. Given the magnitude of the change (a genuine
  multi-hue palette at 0.22–0.30 alpha per stop, versus the prior pass's single hue at 0.09–0.18),
  and that this is no longer a subtle tuning delta but a structurally different set of colors
  appearing in every gradient/glow rule across all six routes, this should now be unmistakable at a
  glance rather than requiring the same "trust the CSS reasoning" caveat as the more marginal
  prior pass — but an actual look in a real browser remains the one verification step this
  environment cannot perform, and is worth the user doing themselves before the next round-trip.
