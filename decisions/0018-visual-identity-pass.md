# 0018 — Visual identity pass: accent hue, self-hosted typography, hero signature element

## Decision
A pure visual/typography pass on top of the fully-working, previously-shipped app (`decisions/0001`
through `0017`): the accent hue changes from generic blue to a deep signal-teal, the app gets a real
self-hosted typeface pairing in place of the system-font stack, and the landing page's hero terminal
becomes the site's one bold signature moment — a scroll-triggered, character-by-character transcript
reveal with a broken→fixed status strip. No session lifecycle, auth, WebSocket terminal protocol,
data fetching, filter logic, or routing changed. The only edit inside a functionally "live" file is
one additive `fontFamily` prop on `TerminalPane.tsx`'s `new Terminal({...})` call (plus one small,
directly-related robustness addition next to it — see "Terminal font unification" below).

## Why
Direct user feedback: the app "should not look basic." Diagnosis (confirmed against the actual code,
not assumed): the app used a 100% generic system-ui font stack everywhere and a textbook
"trustworthy SaaS blue" accent (`#3562e0`) — a fourth, unnamed AI-default look alongside the
`frontend-design` skill's three named ones (cream+serif, near-black+neon, broadsheet), reading as
competent but anonymous.

## 1. Accent hue: `#3562e0` → `#0e7490`
Kept the light-theme neutral/semantic architecture from `decisions/0017` (AA-verified, load-bearing
for difficulty badges/status colors) — only the accent hue changes. `#0e7490` is a deep signal-
teal/cyan, the ANSI hue conventionally used for paths/prompts/hostnames in terminal color schemes —
reads as "monitoring/status" rather than "click here to buy," and ties directly into this product's
actual subject matter. Success/danger/warning are unchanged (`#157a4e`/`#c62e2e`/`#9a6100` — already
credible "uptime green/incident red/degraded amber").

Because `decisions/0017` already refactored ~25 hardcoded accent-tint rules into
`rgba(var(--color-accent-rgb), alpha)`, this was a two-token-value edit (`--color-accent`,
`--color-accent-rgb`) that cascaded correctly everywhere, not a 25-site hunt.

`--color-accent-hover`/`--color-accent-active` were re-derived from the new base color rather than
picked by eye: converted `#0e7490` to HSL (H193°, S82%, L31%) and stepped lightness down to 25% and
19% respectively, holding hue and saturation constant, so the three values read as one consistent
family rather than three independently-chosen colors:
- `--color-accent: #0e7490`
- `--color-accent-hover: #0b5d74`
- `--color-accent-active: #094758`
- `--color-accent-rgb: 14, 116, 144`

### Contrast (actual relative-luminance math, WCAG formula, computed by script — not eyeballed, not assumed to carry over from the old hue)
| Context | Pair | Ratio |
|---|---|---|
| Button text (`.btn-primary`, `.chip-active`, `.auth-toggle-btn.active`, `.skip-link`) | white on `--color-accent` | **5.36:1** |
| Button text, hover state | white on `--color-accent-hover` | **7.41:1** |
| Button text, active/pressed state | white on `--color-accent-active` | **10.22:1** |
| Link text (`a`) inside cards/panels | `--color-accent` on `--color-bg-elevated` (white) | **5.36:1** |
| Link text (`a`) directly on page ground | `--color-accent` on `--color-bg` | **4.87:1** |
| `.faq-item summary:hover`, `.auth-brand:hover` | `--color-accent-hover` on `--color-bg-elevated` | **7.41:1** |
| `.nav-link` hover/active (badge-style tint) | `--color-accent` on its own `rgba(accent,.1)` tint over the white navbar | **4.67:1** |
| `.eyebrow` / `.walkthrough-index` (badge-style tint) | `--color-accent-hover` on the same `rgba(accent,.1)` tint over the page ground | **5.90:1** |
| Focus outline / UI non-text (needs 3:1, not 4.5:1) | `--color-accent` vs white | 5.36:1 — clears the lower UI-component bar comfortably |

All of the above clear WCAG AA (4.5:1 normal text, 3:1 non-text); most clear or come close to AAA
(7:1). For reference, the old blue's equivalent button-text ratio was 5.28:1 — the new hue lands in
almost exactly the same place there, not a regression.

### A pre-existing contrast bug found (and fixed) while auditing this hue
`.walkthrough-index` originally used plain `--color-accent` as text on its own `rgba(accent, 0.1)`
tint. Computed against the **new** hue that's **4.26:1** — just under AA's 4.5:1 for this element's
small (0.85rem) text. Checked whether this was a regression introduced by the hue swap: computed the
identical pairing with the **old** blue and got **4.21:1** — already failing, by almost the same
margin, before this pass. Not a regression, but a real pre-existing gap surfaced by actually
computing the number instead of assuming it was fine.

Fixed with a one-line, already-established-pattern change: `.walkthrough-index`'s text color changed
from `--color-accent` to `--color-accent-hover` — the exact same token `.eyebrow` already uses
against the identical `rgba(accent, 0.1)` tint, for the identical reason. That clears **5.90:1**.
This is a token-reference swap, not a new value, an opacity retune, or a layout change — in scope for
a pass that's already auditing every context this hue touches.

## 2. Typography: Overpass + IBM Plex Sans + IBM Plex Mono, self-hosted via `@fontsource`
Replaces the old zero-personality system-font stack everywhere.
- **Display** (`h1`–`h4` base rule, weights 700/800): **Overpass** — a screen redesign of U.S.
  highway signage type (Highway Gothic). Chosen for the literal subject-matter link — infrastructure
  signage ↔ production infrastructure — rather than the trendy geometric-grotesk cluster
  (Space Grotesk/Sora/Manrope) that has itself become a generic "AI site" tell.
- **Body** (weights 400/500/600): **IBM Plex Sans** — an engineering-institution heritage face,
  legible at paragraph sizes, restrained enough not to compete with the display face.
- **Utility/mono** (weights 400/500): **IBM Plex Mono** — same family lineage as the body face (a
  genuinely deliberate pairing, not three unrelated faces), replacing `--font-mono` and also passed
  as `fontFamily` into the real `TerminalPane`/xterm.js terminal (see below).

Wired at the token level (`--font-display`, `--font-body`, `--font-mono` in `:root`), consumed by
`body` and the base `h1, h2, h3, h4` rule. Every other heading in the app (challenge cards, dashboard,
walkthrough steps, FAQ) picks up the display face automatically through the cascade — intentional,
not an oversight, per the addendum's own "everywhere else just inherits the new tokens" scope rule.
`.walkthrough-index`'s step-index digits already referenced `var(--font-mono)` before this pass, so
they picked up Plex Mono with zero code change — the addendum's "optional, minor callback" fell out
of the token swap for free.

### Font-sourcing adjustment: `@fontsource`, not hand-placed `public/fonts/` binaries
The original plan described self-hosting hand-downloaded `.woff2` files under
`frontend/public/fonts/` with hand-written `@font-face` rules. Per explicit execution-time guidance,
this was adjusted to `npm install @fontsource/overpass @fontsource/ibm-plex-sans
@fontsource/ibm-plex-mono` instead — real `.woff2` files plus generated `@font-face` CSS, versioned
in `package.json`/`package-lock.json` like any other dependency, bundled by Vite at build time
exactly like a hand-placed file would be. Same end result (self-hosted, no runtime Google Fonts CDN
call, real files verifiable in the build output) with no binaries to hand-source or keep in sync by
hand. Imported as side-effect CSS in `main.tsx`, using each package's `latin-<weight>.css` variant
(not the default multi-subset file) to keep the shipped subset to Latin only, matching the original
plan's "latin subset, no legacy-format fallback" intent as closely as `@fontsource`'s own file
layout allows — the one exception being that `@fontsource`'s generated CSS still lists a `.woff`
fallback `src` alongside `.woff2`; left in rather than hand-edited out, since browsers only ever
fetch the first format they support from a `src` list (`.woff2`, universally supported by every
browser this app already requires for WebSocket/xterm.js), so the unused `.woff` line costs nothing
at runtime — it's dead CSS text, not a second network fetch.

Imported weights: Overpass 700/800, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500 — exactly the
weights the addendum specifies for each role, nothing extra.

### A second, related adjustment: `<link rel="preload">` targets, not a hand-known static path
The addendum also called for `<link rel="preload">` in `index.html` for the two above-the-fold fonts
(Plex Sans 400, Overpass 800). With hand-placed files this is trivial (a fixed, known filename). With
`@fontsource` + Vite's normal asset pipeline, font files get a build-time content hash in their
filename (e.g. `ibm-plex-sans-latin-400-normal-<hash>.woff2`) that can't be known ahead of a build —
a static `index.html` tag would either go stale on every rebuild or, worse, preload a URL that
doesn't match what the built CSS's `@font-face src` actually requests (which provides *zero* benefit
— the browser would fetch the preloaded URL, then separately fetch the real one referenced by CSS,
wasting bandwidth instead of saving it).

Fixed with a small `vite.config.ts` addition: `build.rollupOptions.output.assetFileNames` gives
`.woff`/`.woff2` files a stable, un-hashed path (`assets/fonts/<name>.<ext>`) instead of Vite's
default hashed one; every other asset (JS/CSS chunks, images) keeps normal hashed naming. Font bytes
don't change build-to-build the way app code does, so losing per-build cache-busting for them is an
accepted, standard tradeoff. `index.html` then references the two critical files by that stable path
directly — a real static preload tag, not a JS-injected one, and guaranteed to match the actual
`@font-face src` the built CSS emits (verified below). This preload path only resolves in the
production build (`dist/`); Vite's dev server serves `node_modules` packages through its own dev
transform path, so the two preload tags are inert (harmless, ignored) hints while running the dev
override — normal for asset preloading in a dev server and not something either prior design pass on
this project has needed to solve.

## 3. Terminal font unification
`TerminalPane.tsx`'s `new Terminal({...})` call had no `fontFamily` set before this pass (xterm fell
back to its own built-in default). Added:
```ts
fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace'
```
Additive only — if the self-hosted woff2 hasn't finished loading yet, xterm falls through the rest of
the stack, so a slow font fetch never blocks the terminal from opening. This is the one edit inside a
functionally live file in the whole pass, and it makes the real live terminal, the landing page's
decorative hero mockup, inline `code`, and the self-host code block all render the same face for the
first time.

One small, directly-related robustness addition alongside it: the initial `fit.fit()` call (right
after `term.open()`) can run before the Plex Mono woff2 has finished loading, in which case xterm
measures its cell size off a fallback font — normally near-identical, but to close that gap exactly,
a second `fit.fit()` (plus a resize message, if the socket is already open) now also runs once
`document.fonts.ready` resolves. Guarded by a `disposed` flag set in the effect's cleanup so it's a
no-op if the component has already unmounted by the time fonts finish loading.

## 4. The hero signature element
Per the addendum, the *only* bold visual moment in the whole pass — everywhere else (challenge list,
detail, dashboard) inherits the new tokens/typography purely through the CSS cascade, no new
animation or layout changes there.

- **Resized to be visually dominant**: `.hero`'s grid went from a near-even `1.05fr 1fr` split to
  `0.78fr 1.22fr` at the ≥860px breakpoint — the terminal now takes roughly 60% of the row instead of
  matching the headline column's weight, so it reads as the centerpiece rather than a same-weight
  screenshot beside the pitch. `.hero-terminal-body` also grew (font-size 0.82rem → 0.92rem,
  line-height 1.7 → 1.75, padding bumped a step) to fill that larger footprint credibly, and switched
  from `white-space: pre` (horizontal scroll) to `pre-wrap` with `word-break: break-word` so the
  widened terminal's longer lines wrap in place instead of scrolling sideways.
- **Character-by-character reveal on scroll-into-view**: reuses the existing `useScrollReveal` hook
  (no new infra) to detect when the hero terminal enters the viewport, then plays the exact transcript
  already in the DOM one character at a time (≈6ms/char, ≈2.8s total for this transcript's 470
  characters), ending on the real `active` success line. The transcript's content/text is byte-for-
  byte identical to what shipped before this pass — only how it appears changed.
- **Driven by ref + `requestAnimationFrame`, not per-character `useState`**: every character is a real
  `<span>` from first render (so the block occupies its final height immediately — no layout shift as
  the reveal plays), starting at `opacity: 0`. A `requestAnimationFrame` loop computes, from elapsed
  time, how many characters should now be visible, and flips each newly-revealed one's class directly
  via a ref array (`spansRef.current[i].classList.add("is-revealed")`) — bypassing React entirely for
  every per-frame update. The *only* React state change in the whole sequence is one `setState` when
  the last character lands (`revealComplete`), which is what the status strip and cursor key off. This
  follows `vercel-react-best-practices`' "use `useRef` for transient values" guidance directly (avoids
  the "dozens of re-renders for a purely visual effect" the addendum called out).
- **Status strip**: a new 3px `.hero-terminal-status-strip` on the terminal chrome, a plain CSS
  `background-color` transition (600ms, the file's existing signature
  `cubic-bezier(0.16, 1, 0.3, 1)` ease) from `--term-mock-danger` to `--term-mock-success`, toggled by
  the same single `revealComplete` state flip — borrowing the real incident/status-page red→green
  convention directly, not a new component.
- **Gated by both existing motion hooks, matching every other animation on the page**: `useReducedMotion`
  skips the reveal loop entirely and marks the full transcript + status strip resolved synchronously
  on mount (same "show the final state immediately" contract as `.reveal` elsewhere in this file); a
  redundant `prefers-reduced-motion` CSS override (`opacity: 1 !important` on `.hero-char`) covers the
  one-frame gap between paint and that effect running, the same belt-and-suspenders pattern the
  existing `.reveal` rule already uses.
- **No new dependency** — no Framer Motion, matches this file's existing hand-authored,
  dependency-light style.

## Verified
- `npx tsc --noEmit` and `npm run build` clean on the frontend.
- Grepped the built `dist/assets/index-*.css`: all 7 expected `@font-face` rules present (Overpass
  700/800, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500), each `src: url(...)` pointing at a real
  file under `dist/assets/fonts/` that actually exists on disk (`ls dist/assets/fonts` confirmed all
  14 `.woff`/`.woff2` files). Confirmed the two `index.html` preload `href`s
  (`/assets/fonts/ibm-plex-sans-latin-400-normal.woff2`, `/assets/fonts/overpass-latin-800-normal.woff2`)
  are byte-identical to the paths the built CSS's own `@font-face src` rules reference for those same
  two files — the preload isn't just present, it's preloading the exact resource that gets used.
  Confirmed the new `--color-accent*` and `--font-*` tokens landed in the built CSS verbatim.
  Confirmed the hero reveal logic (`is-revealed`, `is-fixed`, the rAF loop) is present in the
  code-split `LandingPage-*.js` chunk, and the `fontFamily` string (`IBM Plex Mono`) is present in the
  code-split `ChallengeDetailPage-*.js` chunk (where `TerminalPane` actually lives) — not just in
  source.
- Computed every contrast ratio above via the WCAG relative-luminance formula in a small script
  (not eyeballed) — full numbers in the table above, including the one pre-existing gap found and
  fixed.
- Rebuilt and booted the real stack (`docker compose up --build -d`); confirmed `postgres` healthy,
  backend `/health` OK, and the dev-override Vite server on `:5173` serves the new tokens/fonts live.
- Terminal-resize verification (the one edit inside a functionally live file): no headless browser
  was available to drive `TerminalPane`/`FitAddon` directly, so this was verified at the protocol
  level instead — signed up a real account via the API, started a real session against
  `perm-config-blocks-service` (a real container built and booted), connected to
  `/ws/terminal?ticket=...` with the exact same message protocol `TerminalPane.tsx` uses, and sent
  two `{"type":"resize","cols":...,"rows":...}` messages. `stty size` run inside the live PTY after
  the second resize reported `40 120` (rows, cols) — an exact match for the `{cols:120, rows:40}`
  message sent, confirming the backend PTY resize path is unaffected end-to-end. (The very first
  resize, sent immediately on socket open before the shell had fully attached, briefly read `0 0` —
  a pre-existing connection-race quirk unrelated to this pass, since no backend code or WS message
  format changed here; the frontend already resends on every `ResizeObserver` firing, so this
  self-corrects on the next real resize.) `fontFamily` itself is additive and typed against xterm's
  own `ITerminalOptions`, confirmed present in the built `ChallengeDetailPage-*.js` chunk (where
  `TerminalPane` lives), and paired with the `document.fonts.ready` re-fit described above as the
  defense against any first-paint cell-size mismatch — the actual in-browser `FitAddon` cols/rows
  and cursor rendering is exactly the piece a real browser look should still confirm, per the
  headless-browser caveat below. Test session and its container were torn down via
  `POST /api/sessions/:id/stop` immediately after (confirmed via `docker ps` — zero
  `app=devops-trainer`-labeled containers remained), and the two throwaway test accounts were
  deleted from `users` directly.
- **No headless browser is available in this environment** (consistent with every prior design pass
  on this project) — the actual rendered look (how dominant the resized hero terminal feels, the
  reveal's pacing, the status-strip transition) was verified by reasoning through the exact CSS
  values, JS timing constants, and built output above, not a screenshot. A real look in a browser is
  still worth the user doing themselves, same caveat as every design pass before this one.
