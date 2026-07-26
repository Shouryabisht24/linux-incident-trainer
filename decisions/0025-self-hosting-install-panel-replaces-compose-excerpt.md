# 0025 — Self-hosting page: install panel replaces the docker-compose.yml excerpt

## Context

`decisions/0023` gave `/self-hosting` a signature device: a real, annotated excerpt of the repo's
`docker-compose.yml`, on the reasoning that an ops-minded reader wants to verify real config, not
marketing copy. The user's direct follow-up request reversed this specific call: don't show the
compose file at all — instead point at the real GitHub repo and give install steps. Both are
legitimate answers to the same underlying goal ("give a self-hoster something real to act on"); the
user's preference wins.

## Decision

`SelfHostingPage.tsx`'s `ComposePanel` (a ~150-line YAML-styled excerpt) is replaced with
`InstallPanel`: a short, literal install script — clone the real repo
(`https://github.com/Shouryabisht24/linux-incident-trainer`, confirmed via `git remote -v` against
this working copy, not guessed), `cd` in, `cp .env.example .env` (with a note to edit
`POSTGRES_PASSWORD`/`JWT_SECRET`, matching the README's own setup instructions verbatim), then
`docker compose up --build`. A "View source on GitHub" button links to the real repo.

Reused rather than reinvented: the same `.walkthrough-terminal-bar`/`-dot`/`-title` editor-chrome
header as the old panel and How It Works' script panel, and `.walkthrough-cmd`'s existing inline
command-chip styling for each step — one shell-command visual language across the page family, not
a third parallel one. The old YAML-specific classes (`.compose-key`/`.compose-value`/
`.compose-line`/`.compose-indent-1..4`/`.compose-panel-badge`) had no other callers anywhere in the
codebase (confirmed via grep) and were deleted rather than left dead, since nothing else used them.
`.compose-panel`/`.compose-panel-footer` survive — `InstallPanel` still uses that outer chrome and
footer-button treatment.

## Verification

`npx tsc --noEmit` and `npm run build` clean. Grepped the built `dist/assets/index-*.css`: new
`.install-steps`/`.install-step-label`/`.install-cmd`/`.install-step-note` present, old YAML-only
classes fully gone (zero matches). Grepped the built `SelfHostingPage-*.js` chunk for the literal
GitHub URL — present, confirmed not fabricated by checking it against this repo's actual
`git remote -v` output. Confirmed live via the running dev server's HMR log (picked up both the
`.tsx` and `.css` edits) and a `200` on `/self-hosting`.
