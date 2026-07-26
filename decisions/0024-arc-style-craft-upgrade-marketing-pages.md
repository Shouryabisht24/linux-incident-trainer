# 0024 — Arc.net-inspired craft upgrade to the marketing/landing page family

## Context

The user asked to borrow specific Arc browser marketing-site techniques — confident gradient
usage, layered/modern cards, a premium feel, refined typography and motion — and apply them to the
six-route marketing family (`/`, `/about`, `/features`, `/how-it-works`, `/self-hosting`, `/faq`
plus `MarketingLayout.tsx`'s shared nav/footer), explicitly scoped away from the authenticated app
for this pass. Two hard constraints governed every choice below: no new accent hues or typefaces
(translate Arc's *techniques*, not its palette, onto this app's existing tokens), and zero new npm
dependencies (every technique is plain CSS). The project's established "precision over quantity"
ethos (`decisions/0021`, `0022`) was treated as a real constraint, not a formality — the hero
terminal's scroll-triggered transcript reveal (`decisions/0018`) is this app's one established
signature moment, and the explicit goal of this pass was a genuine craft upgrade to the surrounding
visual language, not a second "big moment" competing with it.

## Gradient usage: bumped confidence on ambient washes, one gradient-text headline per page

`.hero-bg`'s three radial-gradient washes went from 0.12/0.08/0.07 alpha to 0.18/0.13/0.11; the
four `.marketing-page-header--*` modifiers (and the identical, effectively-dead base rule they all
override) went from ~0.05–0.09 to ~0.09–0.15. Both land inside the requested 0.10–0.20 band and are
still ambient background atmosphere behind foreground content, not a foreground effect themselves
— the dot-grid grain layered into `.hero-bg` was deliberately left at its original 0.05, since it's
a texture accent, not one of the "gradient-mesh washes" the brief was asking to make more
confident.

A new `.gradient-heading` utility (`background: linear-gradient(135deg, var(--color-text),
var(--color-accent-hover))` clipped to text, `@supports (background-clip: text) or
(-webkit-background-clip: text)`-gated with a plain solid-color fallback outside that query) is
applied to exactly one heading per page: the Hero H1 on `/` and `/about` (they share the same
component), and each page's own defining `<h2>` on `/features`, `/how-it-works`, `/self-hosting`,
and `/faq` — `FeaturesSection`'s "What you're actually getting," `WalkthroughSection`'s "What
solving one incident actually looks like," `SelfHostSection`'s "Free. Self-hosted. Yours.," and
`FaqSection`'s "Frequently asked questions." It is deliberately **not** applied to `AboutNavCards`'
or `FinalCta`'s headings on the landing page, or to any `.section-head h2` elsewhere — the brief was
explicit that restraint here is what makes it read as a considered premium touch rather than a
"rainbow effect," and five gradient headlines across five routes (one each) already reads as a
cohesive system without needing a second per page.

### Why the conic-gradient hover-ring was *not* extended to cards

The brief offered this as an explicit "only if it doesn't end up competing with the hero" option,
with its own suggested off-ramp: skip it and spend that craft budget on card depth instead. The
hero terminal frame's `--border-angle` ring is this app's one intentionally-singular "moving
border" component-pattern borrow (see the comment above `.hero-terminal-frame`: "This is the
signature element's one craft upgrade this pass"). `.feature-card`/`.marketing-nav-card` already
carry their own hand-implemented component-pattern borrow — the cursor-tracked spotlight glow — and
adding a second, different animated-border effect on top of that would have given the cards *two*
distinct animated affordances where the hero has one, inverting the intended hierarchy (hero =
the one animated centerpiece; cards = one quiet micro-interaction each). Skipped; the budget went
into the shadow/hover unification below instead, which is the pass's actual card-depth work.

## Modern cards: two-layer shadows everywhere, hover unified, glass only where a gradient exists to show through

`.feature-card` and `.compose-panel`/`.walkthrough-terminal` already had a genuine two-layer resting
shadow (tight contact layer + soft wide ambient layer) from an earlier pass. `.marketing-nav-card`
and `.self-host-card` did not — both gained the identical recipe (`0 1px 2px
rgba(--color-shadow-rgb, .04), 0 20px 40px -28px rgba(--color-shadow-rgb, .18)`) so every card in
the marketing family now shares one resting-elevation language instead of only some of them having
real depth.

Hover states were unified across the two cards that actually have a hover interaction,
`.feature-card` and `.marketing-nav-card` (`.compose-panel`/`.self-host-card` are static document
panels with no hover state, and weren't given one — they aren't links or buttons). Both now use the
identical recipe: `translateY(-6px) scale(1.015)` plus a shadow "bloom" (`0 8px 18px
rgba(--color-shadow-rgb, .1), 0 34px 64px -18px rgba(--color-accent-rgb, .36)`), on the project's
existing signature easing curve (`cubic-bezier(0.16, 1, 0.3, 1)`, already used by both). Previously
`.marketing-nav-card`'s hover was a lighter, single-layer, translateY(-4px)-only treatment — a
genuine inconsistency the brief called out; the two card families now read as one system.
`prefers-reduced-motion`'s existing explicit `transform: none` hover override list (which already
covered `.feature-card:hover`) was extended to include `.marketing-nav-card:hover` for the same
reason.

Glassmorphism (translucent `rgba(255, 255, 255, .78)` background + `backdrop-filter: blur(16px)
saturate(140%)`, the exact recipe already established by `.auth-card`/`.landing-nav.condensed` —
reused verbatim, not reinvented) was applied to exactly one card: `.self-host-card`. It is the only
card in the marketing family that sits directly over a page's own gradient-mesh wash
(`.marketing-page-header--self-hosting`'s `::before`, positioned behind it at z-index 0) — every
other card candidate (`.feature-card`/`.marketing-nav-card` inside `.features-grid`/
`.marketing-nav-grid`, both outside any `.marketing-page-header`) sits on flat `--color-bg`, where a
backdrop-filter has nothing to show through and would, per the brief's own explicit caveat, just
look like a diffuse blur on a plain card. `.compose-panel` nested inside `.self-host-card` was
deliberately left fully opaque — it sits on top of the now-glass card's own surface rather than
directly on the gradient, and it represents reading a real source file, a different register from a
glass "floating" surface (see the existing comment above `.compose-panel` on why it stays a light,
non-glass panel).

## Typography and vertical rhythm

The hero H1's `clamp()` ceiling moved from `3.75rem` to `4rem` — the low end (`2.25rem`) and the
`3.2vw` slope are untouched, so this only raises how large the headline is allowed to get on a wide
viewport, not its behavior at any width already exercised in between.

Auditing vertical rhythm surfaced one real bug, not just a preference gap: `.final-cta-section`
(single class, specificity 0,1,0) declared `padding-top: var(--space-7)`, but `.landing .section`
(two classes, specificity 0,2,0) — the shared rule every marketing `<section className="section">`
also matches — always won that property outright regardless of source order, so
`.final-cta-section`'s own padding-top had **never actually applied**, at any viewport width. This
is the exact "a type-based/element selector and a more-specific one cancel each other out" trap.
Fixed by renaming the selector to `.landing .final-cta-section` (matching `.landing .section`'s
specificity so the later, more-specific-in-source rule now genuinely wins) and standardizing its
value on `--space-8` — the file's largest spacing token — at every breakpoint, rather than only
picking up `--space-8` above 860px the way plain `.section` does. `.stats-grid`'s own tighter
`--space-6` vertical padding was deliberately left alone: it's a compact stat-band by design, not a
"major section," so standardizing every rhythm value onto `--space-8` would have flattened a
real, intentional distinction rather than fixed an inconsistency.

## Verification

- `npx tsc --noEmit` — clean, no output.
- `npm run build` — clean, no CSS-minifier warnings (checked new multi-line comments specifically
  for a stray `*/`, since that broke an earlier pass this exact way).
- Grepped the built `dist/assets/index-*.css`: confirmed `.gradient-heading` (both the plain-color
  base rule and the `@supports`-gated clip-to-text rule), the bumped `.hero-bg`/
  `.marketing-page-header--*` gradient alpha values (`.18`/`.13`/`.11` and `.15`/`.14`/`.13`/`.1`
  ranges), `.hero h1`'s `clamp(2.25rem,1.5rem + 3.2vw,4rem)`, `.marketing-nav-card`'s new resting
  `box-shadow` and unified `:hover` block (`translateY(-6px) scale(1.015)` + bloom, byte-identical
  to `.feature-card:hover`'s), `.self-host-card`'s `backdrop-filter`/translucent background, and
  `.landing .final-cta-section{padding-top:var(--space-8)}` all landed verbatim in the real bundle.
- Grepped the CSS diff for any hex/rgb literal not already one of this app's existing tokens —
  none found; the one new-looking value, `rgba(255, 255, 255, 0.78)` on `.self-host-card`, is a
  byte-for-byte reuse of the value already present twice in the file (`.landing-nav.condensed`,
  `.auth-card`), not a new color.
- `docker compose ps` — all three services `Up`/`Up (healthy)` (dev-override stack already running
  from a prior pass). Hit all six marketing routes plus the backend health check via the running
  :5173 dev server (`curl`/`wget` unavailable in this environment, used `node --eval` with `fetch`
  instead): `/`, `/about`, `/features`, `/how-it-works`, `/self-hosting`, `/faq` and `:4000/health`
  all returned `200`. No rebuild was needed since the dev override bind-mounts `frontend/src` and
  Vite hot-reloads source edits directly. Left running as the steady state.
- **No headless browser is available in this environment**, so the actual rendered feel (the
  gradient-text headlines, the deepened ambient washes, the card shadow bloom and slight scale on
  hover, the self-host card's glass effect against its page's gradient) was verified by reasoning
  through the exact CSS/markup and confirming every new/changed rule reached the real built bundle
  — not by screenshot — same caveat as every design pass before this one on this app.
