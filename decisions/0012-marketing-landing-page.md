# 0012 — Public marketing/landing page: content and stats endpoint

## Decision
Added a real, route-level public landing page (`frontend/src/pages/LandingPage.tsx`, lazy-loaded) served at `/`
for unauthenticated visitors, plus a small unauthenticated `GET /api/public-stats` endpoint
(`backend/src/routes/publicStats.routes.ts`) so the stats section stays accurate as Phase 4/5 content grows
instead of hardcoding numbers that go stale.

1. **`GET /api/public-stats`** — no `requireAuth`, returns only `{ challengeCount, categoryCount }`:
   `count(*) from challenges where is_active = true` and `count(*) from categories`. No user data, no auth
   required, mirrors the existing thin-router-over-`pool.query` pattern used by `categories.routes.ts`. Registered
   in `index.ts` alongside the other routers, just without the `.use(requireAuth)` line.

2. **Root route behavior** — `/` now renders the landing page for logged-out visitors and redirects straight to
   `/challenges` for already-authenticated users (checked via the existing `useAuth()` context), so a returning
   logged-in user never sees marketing copy on refresh. `/login` and the rest of the authenticated app (guarded
   by `RequireAuth`) are unchanged. The landing page itself is `React.lazy`-split from the main bundle, same
   pattern as `ChallengeDetailPage`/`ChallengeListPage`/`ProgressDashboardPage`, so neither bundle pays for the
   other's code.

3. **No fake testimonials** — there are no real users to quote, so that section was repurposed into a concrete
   walkthrough of what solving one incident actually looks like (broken service → live shell → diagnose → fix →
   automated check), reusing real category/flow language rather than inventing quotes or reviewer names.

4. **No pricing tiers** — this is free and self-hosted, there is no billing system and inventing subscription
   tiers would be dishonest. Replaced with a brief "how to run it" section (self-hosted via `docker compose up`,
   pointing at the README) folded into the final CTA area.

5. **No GitHub/repo link** — the working directory is not a git repository (confirmed via environment info) and
   no repo URL exists anywhere in the codebase or README to surface honestly. The hero's secondary CTA is a
   "See how it works" in-page scroll teaser instead of a fabricated external link, per the brief's explicit
   fallback option. Same reasoning applied to the footer (tagline + link back to `/login`, no repo link, no
   fake newsletter signup — there's no email infrastructure for one).

6. **Single dark theme, reused tokens** — the rest of the app is dark-only (`color-scheme: dark` in
   `styles.css`, no theme toggle anywhere). The landing page extends the existing CSS custom properties
   (`--color-*`, `--space-*`, `--radius-*`) rather than introducing a second palette, so it reads as an evolution
   of the existing product, not a bolted-on marketing site. New landing-page-only rules live in the same
   `styles.css` under a clearly delimited section.

## Why
Keeps the stats section honest without a manual update step every time a new challenge ships, keeps the page's
claims verifiably true (no invented trust signals), and keeps the change additive/low-risk consistent with this
project's established pattern of small, unauthenticated, read-only endpoints (`GET /health` already has none of
`requireAuth`; this follows the same shape).

## How to apply
If the challenge/category counts ever need more detail (e.g. per-difficulty breakdown) extend the same endpoint
rather than adding a second one. If a real public repo is ever created, the hero secondary CTA and footer are the
two places to add the link.
