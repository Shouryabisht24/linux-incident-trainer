# 0036 — "Explain" panel: an uncosted, always-available reasoning walkthrough

## Decision

Added a third content mechanic alongside the existing two (Hints — progressive, revealed one at a
time, tracked against `hints_used`; Solution — the full fix, gated behind a `window.confirm` that
ends the challenge). "Explain" sits next to both, unchanged: a panel attached directly to the
terminal that a user can open and close freely, any number of times, while actively working a
challenge, showing the *reasoning* behind the fix (why the symptom means what it means, why the fix
works) rather than the exact commands to type. It costs nothing, never ends the session, and isn't
tracked in `hints_used`/scoring/progress at all.

### 1. `explain.json` schema

```jsonc
[
  {
    "order_index": 1,
    "title": "Short phrase naming what's happening at this step",
    "explanation": "1-3 sentences of REASONING — why this matters, not just what to type."
  }
]
```

Deliberately mirrors `hints.json`'s `{ order_index, text }` shape as closely as the content allows,
with `text` split into `title`/`explanation` — a hint is one flat sentence revealed progressively;
an explain step needed a short heading (so the panel scans as a table of contents at a glance) plus
a body written as reasoning, not instruction. `order_index` is 1-based and sorted defensively by
`getExplainSteps` (`challenge.service.ts`) rather than trusted to already be in file order, matching
how hints are read.

Sample (`challenges/perm-config-blocks-service/explain.json`, step 3 of 6):

```json
{
  "order_index": 3,
  "title": "Root's workers deliberately aren't root",
  "explanation": "Production daemons that bind a privileged port as root (nginx, most web/mail servers) typically drop privileges for the processes that actually touch untrusted input and user-facing files — so a compromised worker can't do root-level damage. That design choice means the permission boundary you actually have to satisfy is the worker's identity (`www-data`), not root's."
}
```

All three reference challenges' `explain.json` were authored by restructuring their existing
`solution.md` into discrete steps with the "why" made explicit — no new technical facts, same
underlying fix, reframed for conceptual understanding rather than copy-paste execution.

### 2. Not synced into the database — read from disk per request

Unlike hints/solution, `getExplainSteps(slug)` (`challenge.service.ts`) reads
`challenges/<slug>/explain.json` directly off disk on every call (`fs.existsSync` /
`fs.readFileSync` / `JSON.parse`, same idiom `syncChallengesFromDisk` already uses) rather than
being upserted into a table by `syncChallengesFromDisk` and served from Postgres the way
hints/`solution_md` are. Reasoning: there is nothing to track or invalidate — no reveal
progression, no per-user state, no cost — so a table row would only exist to hold static file
content that's already sitting on disk. This also means editing `explain.json` for one of the 47
challenges yet to get this treatment never requires a migration, a re-sync, or a `content_version`
bump/image rebuild (it was never part of the image-cache-key story to begin with — see next
section). `session.service.ts`'s `getExplainSteps(sessionId, userId)` wraps the disk-read with the
exact same ownership check (`getOwnedSession`) `getHintsState`/`getSolution` already use, then looks
up the session's challenge slug and defers to `challenge.service.ts`.

The new endpoint, `GET /api/sessions/:id/explain`, is a **plain GET** — no reveal/track mutation
like `POST /:id/hints/reveal`, no session or `hints_used` write of any kind. `requireAuth` (already
applied to the whole `sessionsRouter`) plus the ownership check is the only gate, same as every
other read on this router.

### 3. Security: never `COPY`'d into the challenge Docker image

Confirmed `docker.service.ts`'s `buildImageIfMissing` still calls `docker.buildImage({ context:
challengeDir, src: ["Dockerfile", "seed.sh", "check.sh"] }, ...)` — an explicit allow-list, unchanged
by this pass. `explain.json` was never added to it, exactly like `challenge.json`/`hints.json`/
`solution.md` before it (see `challenges/AUTHORING.md`'s existing rule: only those three files are
sent to the Docker build; everything else needed at runtime must be generated inline in `seed.sh` or
the Dockerfile `CMD`, since there's no way to `COPY` an extra fixture).

Verified directly, not just by reading the allow-list: deleted the cached
`devops-trainer/{perm-config-blocks-service,disk-full-var-log,systemd-crashloop-bad-config}` images
to force a real rebuild from the current build context (with `explain.json` sitting on disk right
next to each `Dockerfile`), started a fresh session for each, and ran
`docker exec <container> find / -xdev -name "explain.json"` — empty output for all three.
`ls /usr/local/bin` inside each container shows only `seed.sh`/`check.sh` (plus, for the systemd
challenge, its compiled `webapp` helper), same as before this change.

### 4. Scope: 3 reference challenges now, 47 more later

Only `perm-config-blocks-service`, `disk-full-var-log`, `systemd-crashloop-bad-config` — the same
three that establish every other authoring pattern in this project — got an `explain.json` in this
pass. `getExplainSteps` returning `[]` for every other challenge is not an error path; it's the
expected, permanent state for a challenge that hasn't had this content authored yet, and the
frontend treats `[]` as "don't render the toggle/panel at all" rather than a broken empty state.
Rolling `explain.json` out to the remaining 47 is a documented follow-up, not part of this change —
same phased-rollout approach this project already used for hints/solution across ~26 challenges
before formalizing `AUTHORING.md`.

### 5. UI placement: attached to the terminal, not a fourth stacked section

`ExplainPanel` (`frontend/src/components/ExplainPanel.tsx`) renders nothing — not even a toggle
button — when `useExplainSteps` resolves to `[]`, so a challenge without this content shows exactly
today's UI. When steps exist, `ChallengeDetailPage.tsx` wraps `.terminal-frame` and `<ExplainPanel>`
in a new `.terminal-explain-layout` container (only gaining the `.has-explain` modifier class when
steps are actually present, so no layout space is reserved for an absent panel):

- **Narrow viewports** (below the existing `min-width: 900px` breakpoint this app already uses for
  `.dashboard-grid`'s own sidebar split): plain flex column — the panel is a drawer directly below
  the terminal, expanding open via the same `grid-template-rows: 0fr → 1fr` collapse technique
  `.auth-collapse` already uses for the signup form's optional fields (proven to animate smoothly
  without JS height measurement; reused rather than inventing a second collapsing mechanism).
- **`min-width: 900px`**: the layout switches to a flex row — the terminal keeps its existing width
  behavior, and the panel becomes a fixed `~300px` sidebar beside it (`flex: 0 0 300px`), so it reads
  as chrome attached to the terminal rather than a separate scrolled-to page section.

The toggle button ("Walk me through it" / "Hide walkthrough") lives at the top of the panel itself,
directly beside `.terminal-frame` in both layouts — chosen over adding it to the existing
Check/Hint/Solution/Stop button row so the button and the content it opens are never separated by a
scroll gap, and so the whole feature (toggle + content) is one self-contained component with plain
`useState` for open/closed, no state lifted into the page.

Styling reuses existing tokens only: `.card` elevation for the step list, `--space-*`/`--radius-*`
custom properties, the existing `.explain-step-index` numbered-chip treatment mirrors
`.celebration-icon-chip`'s existing shape (circular, tinted with `--color-accent`). No new npm
dependency. The chevron rotation and collapse transition both got explicit
`prefers-reduced-motion` overrides (`transition: none`) in the existing reduced-motion block at the
end of `styles.css`, alongside the blanket `* { transition-duration: 0.001ms !important }` rule
already there — belt-and-suspenders, matching this file's existing convention (e.g. `.dot-connecting`
has both).

## Verification

- `cd backend && npx tsc --noEmit` — clean. `npm test` — 3 files, 23 tests, all passing (unchanged
  from before this pass).
- `cd frontend && npx tsc --noEmit` — clean. `npm run build` — clean, 381 modules, no CSS-minifier
  warnings. `npm test` (Vitest) — 5 files, 28 tests, all passing.
- `docker compose up --build -d` — all three services healthy.
- Signed up a throwaway account, started a real session on each of the 3 reference challenges, and
  called `GET /api/sessions/:id/explain` directly against the running backend: real, non-empty step
  content came back for all three. Started a session on a 4th, non-reference challenge
  (`user-account-locked`) and confirmed the same endpoint returns `{"steps":[]}` — no error.
- Forced a real image rebuild (deleted the 3 challenges' cached images) and confirmed via
  `docker exec <container> find / -xdev -name "explain.json"` that it is genuinely absent from all
  three running containers post-rebuild — not just absent from the (stale) allow-list reasoning.
- Re-verified the existing mechanics are completely unaffected on `perm-config-blocks-service`:
  started a session, revealed a hint (tracked/counted as before), confirmed `check` fails
  pre-fix, applied the real fix as `trainee` via `docker exec` (`sudo service nginx start` +
  `chmod 755`/`644`), confirmed `check` then passes, and confirmed `GET /solution` still returns the
  original `solution.md` content unchanged.
- Cleaned up: stopped every session created during verification, confirmed
  `docker ps -a --filter label=app=devops-trainer` shows nothing left running, and deleted the
  throwaway account (confirmed its login now fails).
- Left the dev-override stack (`docker compose up --build -d`, no explicit compose file) running as
  the steady state afterward, per this project's standing convention.

**What could not be verified**: no headless browser exists in this environment, so the panel's
actual rendered layout (does the 900px breakpoint genuinely read as "sidebar attached to the
terminal," does the grid-row collapse actually animate smoothly, does the sidebar's fixed width look
right beside a resizable `.terminal-wrap`) could not be watched directly. What was verified instead:
careful reading of the CSS against this app's own established, already-working patterns
(`.dashboard-grid`'s identical `min-width: 900px` two-column switch; `.auth-collapse`'s identical
`grid-template-rows` collapse, already shipping and presumably visually confirmed when it was
added) — the same techniques, applied to a new pair of elements, not a new layout mechanism being
introduced sight-unseen.

## How to apply

Authoring `explain.json` for one of the remaining 47 challenges is: write the array (grounded in
that challenge's own `solution.md`, restructured into discrete reasoning steps, following the
schema above), drop it in `challenges/<slug>/explain.json` — nothing else. No `content_version`
bump, no migration, no code change; `getExplainSteps`/`ExplainPanel` already handle its presence or
absence generically. Do not add `explain.json` to `docker.service.ts`'s `buildImage` `src` list —
that's the one thing that would break the security property this decision documents.
