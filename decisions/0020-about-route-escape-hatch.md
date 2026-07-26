# 0020 — `/about`: a deliberate escape hatch back to the public landing page

## Context

`decisions/0019` gave logged-in users a real home (`/dashboard`) and had `RootRoute` redirect any
authenticated visit to `/` straight there, on the reasoning that a returning user should never have
to look at marketing copy again. That reasoning still holds for `/` itself — but it had a side
effect nobody caught until the user hit it directly: there was no way, from inside the logged-in
app, to look at the public landing page again. Not a broken link — just nothing linked to it at
all.

## Decision

Added `/about`: the same `LandingPage` component, mounted at a second route that sits outside
`RootRoute`'s auth redirect, so it renders regardless of login state. `NavBar` gets an "About" link
to it. `/` keeps redirecting authenticated visitors away (0019's behavior is unchanged) — `/about`
is the explicit, always-reachable path to the same content instead.

Because the same component now serves both a logged-out marketing audience and a logged-in visitor
poking around, its four CTAs (`LandingNav`, `Hero`, `FinalCta`, `LandingFooter`) became auth-aware
via `useAuth()`: logged out sees "Log in" / "Get started" pointing at `/login`; logged in sees "Go
to dashboard" pointing at `/dashboard`. Showing a "Log in" button to someone who is already logged
in would just be confusing, not broken (their next click would bounce them straight back out via
`LoginPage`'s own redirect) — but confusing is still worth fixing while touching this code.

Fixed one related staleness in the same pass: `LoginPage` redirected an already-authenticated user
to `/challenges`, a holdover from before `/dashboard` existed as the real home. Now matches
`RootRoute` and points to `/dashboard`.

## Alternatives considered

- **Relax `RootRoute` to stop redirecting `/` for authenticated users.** Rejected — that was a
  deliberate, tested decision in 0019 based on the same complaint this decision is fixing (no
  bounce-back-to-marketing loop on every refresh). Reversing it would reopen that problem to fix
  this one instead of fixing both.
- **A modal or in-page toggle instead of a real route.** Rejected for no real benefit: a route is
  shareable, works with browser back/forward, and needed zero new state — `LandingPage` already
  works standalone since it's rendered the same way today via `RootRoute`.

## Verification

`npx tsc --noEmit` and `npm run build` clean on the frontend; confirmed via the build output that
`LandingPage` still resolves to a single shared chunk (one `LandingPage-*.js` in `dist/assets`, not
two) — mounting it at a second route doesn't double-ship its JS since both dynamic `import()` calls
share the same module specifier.
