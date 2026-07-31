# 0033 — Frontend test infrastructure: Vitest + Testing Library, jsdom-only

## Context

The frontend has had zero automated tests since Phase 0 — every prior verification pass in this file
has been manual (reading code, curling the backend, and repeatedly noting "no headless browser
available in this environment"). That's fine for CSS/visual passes where there's genuinely no
alternative, but several hooks and pure functions added across recent passes (`useNoSpaceField`,
`useCountUp`, `useScrollReveal`, `CommandPalette`'s filter, `ChallengeDetailPage`'s
`detectCelebration`/`snapshotProgress`) have real logic/branches that manual reading alone can't
verify with confidence — e.g. `useCountUp`'s easing curve, `detectCelebration`'s tie-break between
first-solve and category-complete, or that `useNoSpaceField` actually blocks a space on all three
paths it claims to (keydown, paste, change-backstop).

## Decision

Added `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as **dev-only**
dependencies (`frontend/package.json`). This project's standing "zero new dependencies" rule has
always been about runtime dependencies for hand-built UI (see decisions/0018 and every visual pass
since) — it was never meant to block test tooling, which ships in none of `dist/`. Confirmed via
`npm run build` + grepping `dist/assets/` for `test` — zero matches; the production bundle is
unaffected.

Configuration lives in a standalone `frontend/vitest.config.ts` (not merged into `vite.config.ts`):
the production config's `build.rollupOptions`/dev `server.proxy` are irrelevant to a jsdom test run,
so a small dedicated config (just `@vitejs/plugin-react` for JSX + the `test` block) is simpler than
merging. `test.environment: "jsdom"`, `test.setupFiles: ["./src/test/setup.ts"]`. `globals` is left
`false` (not enabled) — test files import `describe`/`it`/`expect`/`vi` explicitly from `"vitest"`
rather than relying on ambient globals, so no `tsconfig.json` "types" changes were needed to keep
`npx tsc --noEmit` clean. `package.json` gained `"test": "vitest run"`.

`src/test/setup.ts` handles the two things jsdom doesn't provide out of the box:
- `window.matchMedia` doesn't exist in jsdom at all; every hook downstream of `useReducedMotion`
  (`useCountUp`, `useScrollReveal`) would throw on mount without a stub. Defaults to
  `matches: false` (no reduced-motion preference), overridable per-test via
  `vi.spyOn(window, "matchMedia").mockReturnValue(...)` to exercise the reduced-motion branch.
- `@testing-library/react`'s automatic post-test unmount only self-registers against a *global*
  `afterEach` — since `globals` is off, that hook never fires and every `render()` from a previous
  test stayed mounted into the same jsdom document (`getByText`/`getByLabelText` started throwing
  "found multiple elements" the moment more than one test in a file rendered the same markup).
  Fixed by explicitly wiring `afterEach(() => cleanup())` in the setup file.

`IntersectionObserver` (needed for `useScrollReveal`) is deliberately **not** stubbed globally in
`setup.ts` — it's mocked per-test-file (`useScrollReveal.test.tsx`) with a small class that captures
the constructor's callback and exposes an instance/disconnect counter, since only that one hook
needs it and a global stub would hide accidental real usage elsewhere.

## What's covered

- `useNoSpaceField` (`src/hooks/useNoSpaceField.test.tsx`): all three whitespace-blocking paths the
  hook documents — typed-space blocked via keydown (`preventDefault` called, value unchanged),
  pasted text with embedded whitespace stripped while preserving the surrounding text and caret
  position, and a programmatic `change` event's backstop stripping. Plus `stripWhitespace` directly.
- `useCountUp` (`src/hooks/useCountUp.test.ts`): eases (not linear) from 0 to target once `start`
  flips true, with `requestAnimationFrame`/`performance.now()` fully mocked for deterministic
  halfway-point and end-state assertions; confirmed the *actual* contract for `start` already being
  `true` at mount (it does **not** jump straight to target — the initial `useState` seed only checks
  `reducedMotion`, not `start`, so it still animates from 0 unless reduced-motion is on); and that
  reduced-motion returns the target immediately with zero animation frames scheduled.
- `useScrollReveal` (`src/hooks/useScrollReveal.test.tsx`): `visible` starts `false`, flips to `true`
  and disconnects its observer (once) when the mocked `IntersectionObserver` callback reports
  intersection; stays `false` on a non-intersecting callback; resolves `true` immediately for
  reduced-motion users without ever instantiating an observer.
- `CommandPalette`'s filter (`src/components/CommandPalette.tsx` + `.test.ts`): the inline substring
  filter was extracted to an exported pure function, `filterActions(actions, query)` — a clean,
  behavior-preserving extraction (same logic, same call site via `useMemo`), not a component
  refactor. Tested directly: empty/whitespace query returns everything, case-insensitivity, trimming,
  no-match, and that filtered order is preserved from the source list.
- `ChallengeDetailPage`'s `detectCelebration`/`snapshotProgress` (`.test.ts`): both functions were
  already pure but not exported — added `export` (no logic change) so they're importable. Covered:
  no-op on missing/undefined progress data, first-ever solve detection, category-complete detection,
  neither firing on a re-check of an already-solved challenge, category-complete correctly gated on
  the category having been *incomplete* before the check, and the actual tie-break (first-solve wins
  when both conditions are true in the same check — the implementation checks and returns on
  first-solve before ever reaching the category-complete branch).

Total: 28 tests across 5 files, all passing (`npm test`).

## What's explicitly not covered

- **No end-to-end/real-browser testing.** This is jsdom — a simulated DOM in Node, not an actual
  browser. Nothing about real click coordinates, actual CSS layout/paint, or genuinely visual
  concerns (the countless hand-built micro-interaction/gradient/animation passes tracked earlier in
  this file) is verified by this pass, same caveat as every prior visual change: "no headless browser
  available in this environment" still holds. Playwright/Cypress were explicitly out of scope for
  this pass.
- No test for `CommandPalette`'s keyboard navigation (arrow keys/Enter/Escape/focus-trap) or its
  render output — only the extracted filter function. Mounting the full component needs a router +
  react-query context; left for a future pass if warranted.
- No tests yet for other hand-built pieces (`Celebration`, `TerminalPane`'s xterm bridge, toast
  context, auth context) — this pass targeted exactly the hooks/pure-functions named as candidates,
  not a full coverage sweep.
- One harmless jsdom console warning appears during the run ("Not implemented: HTMLCanvasElement's
  getContext()") — triggered transitively by `ChallengeDetailPage.tsx`'s import of `TerminalPane`
  (which pulls in `@xterm/xterm`, which feature-detects canvas at module load). Non-fatal, doesn't
  fail any test; not worth stubbing out for this pass.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test` (`vitest run`) — 5 files, 28 tests, all passing.
- `npm run build` — clean, fresh `dist/` (deleted the stale one first) matches the pre-existing
  chunk layout/sizes; confirmed no `*.test.*` files ended up in `dist/assets/`.
