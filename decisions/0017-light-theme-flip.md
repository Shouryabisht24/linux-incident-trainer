# 0017 — Flip the frontend from dark theme to light theme (single theme, no toggle)

## Decision
`frontend/src/styles.css`'s `:root` token block now defines a light palette instead of a dark one — `color-scheme: light`, not `dark`. This applies app-wide (landing, login/signup, challenge list, challenge detail, progress dashboard): one consistent theme, same as before, no dark/light toggle added. Every color value in the file was re-picked for a light ground, not mechanically inverted. Layout, component structure, and copy are untouched — this was a color/surface-treatment pass only.

One deliberate exception: the real in-browser terminal (`TerminalPane`/`xterm.js`) stays dark, plus — a related but distinct call made in this same pass — the landing page's decorative `.hero-terminal` mock and the self-host `.code-block` snippet also stay dark. See "Terminal stays dark" below.

## Why
Requested directly: the existing dark theme should become a genuinely eye-pleasing light theme, not `#000` inverted to `#fff`.

## The palette
Background/surface (elevation now reads via a brighter surface + shadow, not a darker one — the opposite of how the old dark theme's `bg < bg-elevated < bg-elevated-2` ladder worked):
- `--color-bg: #f2f4f8` — soft cool off-white page ground, not stark white (stark white read harsh at this size).
- `--color-bg-elevated: #ffffff` — cards, navbar, toolbar: the brightest surface, deliberately pure white so it visibly lifts off the page ground.
- `--color-bg-elevated-2: #e8ebf1` — inset surfaces (inputs, code inline, chip groups, skeleton base): slightly darker than both, reading as recessed rather than raised.
- `--color-border: #dbe0e8`, `--color-border-strong: #c7cedb` (hover/stronger dividers; new token, replacing two duplicated hardcoded hex hover values).

Text:
- `--color-text: #171a23` — near-black navy, not flat `#000`.
- `--color-text-muted: #4b5563`
- `--color-text-faint: #66707c`

Brand/semantic (same hue families as the old dark palette for continuity, all re-saturated/darkened — the old values were tuned to pop on `#0f1115` and are too light/washed to read as text on a light ground):
- `--color-accent: #3562e0` / hover `#2951c9` / active (pressed) `#1f3ea3` / contrast text `#ffffff` (was `#0b1020` — needed to flip to white once the accent itself got darker; dark text on the new accent only clears ~3.3:1, below AA).
- `--color-success: #157a4e` (was `#3ecf8e`)
- `--color-danger: #c62e2e` (was `#ff6b6b`)
- `--color-warning: #9a6100` (was `#f5b942` — a bright gold reads as barely-there on light backgrounds as text; this is a deep amber, still clearly the same warm hue family)
- `--difficulty-beginner/intermediate/hard` now alias `success`/`warning`/`danger` directly (were separately hardcoded to the same values).

New centralizing tokens added, not previously needed on a dark ground where these all stayed hardcoded hex without drifting: `--color-accent-rgb`, `--color-success-rgb`, `--color-danger-rgb`, `--color-warning-rgb` (raw R,G,B triples) so every `rgba(<color>, alpha)` tint/glow/wash in the file reads `rgba(var(--color-X-rgb), alpha)` instead of a literal triplet — before this pass there were ~25 places hardcoding e.g. `rgba(91, 140, 255, …)` for the accent; those would have silently gone stale (still referencing the *old* blue) the moment the token itself changed, so they're now wired through the shared channel token. Also added `--color-shadow-rgb: 16, 24, 40` — a dark ink-blue-grey (not flat black) reused across every shadow in the file, since light-mode elevation is carried by shadow rather than the dark theme's glow/border approach.

## Contrast (actual relative-luminance math, WCAG formula, not eyeballed)
| Pair | Ratio |
|---|---|
| `--color-text` on `--color-bg` (body text, page) | 15.8:1 |
| `--color-text` on `--color-bg-elevated` (body text, card) | 17.4:1 |
| `--color-text-muted` on `--color-bg` | 6.9:1 |
| `--color-text-muted` on `--color-bg-elevated` | 7.6:1 |
| `--color-text-faint` on `--color-bg` | 4.6:1 |
| `--color-text-faint` on `--color-bg-elevated` | 5.0:1 |
| `--color-accent-contrast` (button text) on `--color-accent` (button bg) | 5.3:1 |
| `--color-accent` as link/text on `--color-bg-elevated` | 5.3:1 |
| `--color-success` (badge-beginner text) on its own tinted badge bg | ~5.2:1 |
| `--color-warning` (badge-intermediate text) on its own tinted badge bg | ~5.0:1 |
| `--color-danger` (badge-hard text) on its own tinted badge bg | ~5.3:1 |

All of the above clear WCAG AA for normal text (4.5:1); several clear or nearly clear AAA (7:1). `--color-text-faint` was iterated three times specifically because the first two candidates cleared 4.5:1 against white but dropped to ~4.2–4.3:1 against the page background — final value clears both.

## The ~8 hand-tuned overlay values
Grepped every `rgba(255, 255, 255, …)` / `rgba(0, 0, 0, …)` in the old file (9 found, matching the "roughly 8" estimate) — each was a dark-mode-specific sheen/glow/shadow, not portable as-is:
- `.toast`, `.feature-card` (resting + hover), `.auth-card` box-shadows: black-based shadows re-tuned to the shared ink-toned `--color-shadow-rgb` at much lower opacity (0.4–0.7 alpha reads as a harsh black smear on a light ground; retuned to two-layer tight+ambient shadows around 0.04–0.22 alpha, the standard light-mode "soft elevation" pattern).
- `.spinner`'s base ring (`rgba(255,255,255,.25)`): was a whitish ring meant to be faintly visible against near-black — on light surfaces it was would-be-invisible. Changed to `rgba(var(--color-shadow-rgb), .18)` so the base ring reads on any surface, with the moving arc still `currentColor`.
- `.hero-bg`'s dot-grid texture (`rgba(255,255,255,.05)`): white flecks on near-black flipped to ink flecks (`rgba(var(--color-shadow-rgb), .05)`) on light.
- `.feature-card`'s resting/hover "glossy top edge" (`rgba(255,255,255,.03)`/`.05` inset lines): this is the one case that couldn't just be recolored — the card surface itself (`--color-bg-elevated`) is now pure white, the brightest value in the whole palette, so *any* white-tinted highlight on top of it is a no-op almost by definition. Removed outright rather than reworked; elevation on these cards now comes entirely from the two-layer shadow instead, per the brief's own guidance that light mode should lean on shadow over glow.
- `.hero-terminal`'s shadow (`rgba(0,0,0,.6)`): kept strong-ish and re-tuned to the ink token, since a dark floating panel *should* cast a pronounced shadow against a light page — the intent here was still valid, just needed the harsh flat-black swapped for the softer ink tone.

Two more hardcoded dark-specific colors were found and fixed that weren't in the white/black overlay list: `.landing-nav.condensed` and `.auth-card`'s frosted-glass backgrounds were `rgba(15, 17, 21, .72)` / `rgba(23, 26, 33, .72)` (opaque-ish dark navy glass) — flipped to `rgba(255, 255, 255, .78)` (frosted white glass), which is the standard light-mode glassmorphism treatment and pairs correctly with the existing `backdrop-filter: blur()`.

## Hero gradient-mesh + wave
`.hero-bg`'s three radial-gradient "washes" (accent/success/warning) and its dot-grid texture were tuned for near-black at opacities of 0.22/0.13/0.08/0.05. Ported at the same opacities they'd have read as either invisible or muddy on `#f2f4f8` — a more saturated color needs *less* alpha to register against a light ground than the old, lighter dark-mode hues needed against near-black. Retuned to 0.12/0.08/0.07/0.05 using the new `--color-accent-rgb`/`--color-success-rgb`/`--color-warning-rgb`/`--color-shadow-rgb` tokens. `.hero-wave`'s fill was already `var(--color-bg-elevated)` (a token, not a literal), so it tracked the theme flip automatically — it's now white, still seaming the hero into the (also now-white) stats section below exactly as designed.

## Terminal stays dark (the one intentional exception)
`TerminalPane`/`xterm.js` itself needed no code change at all — it never had a `theme` passed to `new Terminal()`, so it already renders with xterm's own default dark theme regardless of the surrounding app; its container `.terminal-wrap` has a hardcoded `background: #000` untouched by this pass. The chrome around it (`.terminal-status`, its connection dot, the Reconnect button) sits *outside* `.terminal-wrap` in the page's normal light chrome and picks up the new light tokens correctly.

Separately, this pass also kept two decorative, non-interactive mockups dark: the landing page's `.hero-terminal` (a static illustration of a terminal session fixing `systemd-crashloop`) and the self-host section's `.code-block` (a `docker compose up` snippet styled like terminal output). These aren't the literal component the brief named, but they visually represent the same real terminal that stays dark — flipping them light would both (a) misrepresent what the product's terminal actually looks like, and (b) lose a natural "dark window on a light page" moment that reads as intentional rather than inconsistent. Both were previously wired straight to the app's semantic tokens (`var(--color-bg-elevated)`, `var(--color-text)`, `var(--color-success)`, etc.), which would have silently gone half-broken once those tokens flipped light (e.g. near-black text on a near-black mock background). Fixed by introducing a small dedicated token set — `--term-mock-bg`, `--term-mock-bar-bg`, `--term-mock-border`, `--term-mock-text`, `--term-mock-text-bright`, `--term-mock-text-faint`, `--term-mock-prompt`, `--term-mock-success`, `--term-mock-danger`, `--term-mock-warning` — that simply preserve the old dark-theme hex values verbatim, scoped to only these two decorative surfaces, decoupled from the app's now-light semantic tokens.

## Verified
- `npx tsc --noEmit` and `npm run build` clean on the frontend.
- Grepped the built `dist/assets/index-*.css`: contains the new `:root` block verbatim (`--color-bg: #f2f4f8`, `--color-accent: #3562e0`, `color-scheme:light`, etc.) — confirmed via the actual built output, not just source.
- Rebuilt and booted the real stack twice: once against the base `docker-compose.yml` only to exercise the production nginx image on `:3000` (confirmed `/`, the built CSS asset through nginx, and `/api/public-stats` — `{"challengeCount":50,"categoryCount":10}` — all serve correctly, and that the nginx-served CSS's `:root` block matches the new tokens byte-for-byte with the direct build output), then rebuilt again with the dev override (the documented steady state) and confirmed `:5173`'s live-served `styles.css` (via Vite's dev transform) also carries the new tokens.
- Computed contrast ratios via the WCAG relative-luminance formula by hand for every pair listed above rather than estimating by eye.
- **No headless browser was available in this environment**, so the actual rendered look — hero gradient/wave feel, card shadow softness, hover states, the frosted-glass nav/auth-card blur — was verified by reasoning through the CSS values and the built output, not a screenshot. A real look in a browser is still worth the user doing themselves, same caveat as prior visual passes on this project.
