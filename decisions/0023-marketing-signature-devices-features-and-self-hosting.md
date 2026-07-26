# 0023 — Per-page signature devices for the four split marketing pages: two finished, two built

## Context

`decisions/0022` split `LandingPage.tsx`'s four anchor sections into their own routes
(`/features`, `/how-it-works`, `/self-hosting`, `/faq`), but each page just inherited its old
section's look verbatim plus the new, identically-shaped `.marketing-page-header` gradient wash
(different color knobs per page, same template). This pass is a visual design follow-up: give each
of the four its own signature device grounded in that page's actual subject matter, rather than
leaving "one template stretched four ways." Auditing the four before touching anything found that
two of them already had this from an earlier pass and only needed confirming, not rebuilding; the
other two genuinely didn't and are the real work in this pass.

## Audit: How it works and FAQ already had their signature device

- **How it works** (`.walkthrough-terminal*`, `styles.css:1977-2089`) already wraps the five-step
  walkthrough in real terminal chrome (traffic-light dots, a `walkthrough.sh` title bar) and
  renders each step as a `#`-prefixed comment line above a `$ <real command>` line, staggered via
  `Reveal`. Numbering here (`01`/`02`/...) is earned rather than decorative — this genuinely is a
  chronological sequence (start → shell → find the break → fix it → check), unlike the other three
  pages, which is why numbered markers were deliberately not extended to any of them.
- **FAQ** (`.faq-item*`, `styles.css:2129-2192`) already uses the native `<details>` accordion (the
  right UI already) with a small `>` `kicker-prompt` glyph before each question and quiet
  hover/focus states, with no big visual swing competing with the other three pages.

Both were left untouched in this pass beyond re-reading them to confirm they still hold up against
the brief (they do).

## Decision 1: Features — a colorized `ls -l` permission-string prefix on each file-tab

Each feature card's file-tab already named a real file in this codebase (`seed.sh`,
`terminalSocket.ts`, `check.sh`, `hints.json`, `challenge.json`, `session.service.ts`) — a device
that only works because it encodes something true about the product ("this is a real file"), not
because it's decorative. This pass adds the missing half of that same idea: a real `ls -l`-style
mode string before the filename (`FeaturesPage.tsx`'s `FEATURES` array gained a `perm` field),
picked per file's actual role — `-rwxr-xr-x` for the two scripts a challenge author's tooling
actually executes (`seed.sh`, `check.sh`), `-rw-r--r--` for the rest (TS source compiled/run by
node rather than invoked directly, or plain JSON/data files).

The string is rendered character-by-character (`f.perm.split("")`) so only the `x` characters can
be individually wrapped in `.feature-card-tab-perm-x` (`color: var(--color-success)`) — the same
thing a colorized `ls -l`/`ls --color` does in a real shell for executable files. Every other
character, including the non-`x` characters of an executable's own string, stays the tab's
ordinary `--color-text-faint`. This is a one-bit accent restricted to real information (whether the
file is actually marked executable), not a second color scheme layered onto the card — no new
tokens, `--color-success` is already in `:root`. `aria-hidden="true"` on the whole perm span since
it reinforces a claim the visible filename text already states; a screen reader doesn't need
`-rwxr-xr-x` read out character by character on top of "seed.sh."

## Decision 2: Self-hosting — a real, annotated docker-compose.yml excerpt replaces the plain code-block

The old `.self-host-card` right column was a two-line `.code-block` with just the setup commands
(`cp .env.example .env` / `docker compose up --build`) — no actual configuration shown. An
ops-minded reader deciding whether to self-host this wants real deployment specifics (what's
exposed, what's mounted, what the one real resource guard is), not marketing copy about "one
command." `SelfHostingPage.tsx` now has a `ComposePanel` component rendering a verified excerpt of
the real repo-root `docker-compose.yml`: `services.postgres` (image, `POSTGRES_PASSWORD`,
healthcheck), `services.backend` (build context, `MAX_CONCURRENT_SESSIONS`/`PORT`, the
`docker.sock`/`./challenges` volume mounts, port `4000:4000`, `depends_on.postgres.condition:
service_healthy`), `services.frontend` (build context, port `3000:80`, `depends_on: [backend]`),
and the top-level `networks.internal: {}`. Every remaining key/value line is copied verbatim from
the real file — nothing invented. It's explicitly an **excerpt**, not the whole file (trims
`POSTGRES_DB`/`POSTGRES_USER`, healthcheck interval/timeout/retries, `JWT_SECRET`,
`CHALLENGE_CONTAINER_NETWORK`, each service's own `networks:` list, and the top-level `volumes:` for
length) — the panel's header bar carries a small "excerpt" badge so it's honest about being
partial rather than implying it's the complete file.

Four `#`-prefixed comment lines are added as real annotations next to real lines, using the exact
tokens the brief specified (`--color-accent` for keys, `--color-text-muted` for comments — the
light semantic tokens, applied as authored):
1. Above `healthcheck:` — ties it to the real `depends_on: condition: service_healthy` line later
   in the same file.
2. Above the `docker.sock` mount — names the docker-outside-of-docker mechanism
   (`CLAUDE.md`/`decisions/0001`) the mount actually exists for.
3. Above `MAX_CONCURRENT_SESSIONS: 3` — the one real resource-guard-shaped value that actually
   exists in this compose file. Deliberately does **not** invent a `mem_limit:`/`cpus:` line next to
   it — the real per-container CPU/memory/pid limits live in `docker.service.ts` at runtime, not in
   this compose file, and fabricating one to make a tidier "resource limits" annotation would have
   violated the one hard rule for this device.
4. Above `networks:` at the bottom — a shortened copy of the comment that is *already* sitting
   above the real file's own `networks:` block, not new commentary.

The panel reuses `.walkthrough-terminal-bar`/`-dot`/`-title` verbatim for its header chrome instead
of inventing a fourth parallel set of "editor panel" classes — same window-chrome language as How
It Works. It is deliberately a **light** surface (`.compose-panel`, `--color-bg-elevated`), not the
dark `--term-mock-*` surface the old `.code-block`/`.hero-terminal` use: those two represent an
actual live terminal session and stay dark per the project's existing convention
(`decisions/0017`); this panel represents reading a real source file off disk, which this codebase
already treats as a different, lighter register. The two original setup commands survive as a
`.compose-panel-footer` reusing `.walkthrough-cmd` rather than becoming a second, separate dark box
— one panel style on this page, not three. Line content wraps normally (`white-space: normal;
overflow-wrap: anywhere`) rather than forcing horizontal scroll like `.walkthrough-cmd`'s literal
shell commands do, since these are prose/YAML lines that don't need to stay copy-pasteable on one
line — the safer choice under ~360-400px.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, no CSS-minifier warnings (checked specifically for a stray `*/` inside
  any new multi-line CSS comment, since that broke an earlier pass this exact way).
- Grepped the built `dist/assets/index-*.css`: `.feature-card-tab-perm`, `.feature-card-tab-perm-x`,
  `.compose-panel`, `.compose-panel-badge`, `.compose-body`, `.compose-line`, `.compose-indent-1`
  through `-4`, `.compose-key`, `.compose-value`, `.compose-comment`, `.compose-blank`,
  `.compose-panel-footer` all present in the real bundle; the now-unused `.code-block` rule (its
  only caller was the code this pass replaced) is gone from the built CSS too.
- Grepped the built `SelfHostingPage-*.js` chunk for `MAX_CONCURRENT_SESSIONS`,
  `/var/run/docker.sock`, and `service_healthy`, then re-grepped the real root `docker-compose.yml`
  for the same three strings one more time — exact matches, confirming nothing drifted from the
  real file between reading it and shipping it.
- Dev-override stack (already running from a prior pass) confirmed still healthy:
  `docker compose ps` showed all three services `Up`/`Up (healthy)`; `GET /health` on :4000 and
  `GET /features`, `GET /self-hosting` on the :5173 dev server all returned `200`. Left running as
  the steady state — no rebuild needed since the dev override bind-mounts `frontend/src` and Vite's
  hot reload picks up source edits directly.
- **No headless browser is available in this environment**, so the actual rendered look (the
  colorized permission-string accent, the compose panel's line coloring/indentation/wrapping at
  narrow widths) was verified by reasoning through the exact CSS and markup and confirming every
  new class reached the real built bundle, not by screenshot — same caveat as every design pass
  before this one on this app.
