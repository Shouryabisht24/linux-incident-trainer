# Tasks — DevOps Troubleshooting Trainer

Tracks work across the phased build order in the implementation plan. Check items off as they land; add new items under the relevant phase as they're discovered. See `decisions/` for the reasoning behind non-obvious choices.

## Phase 0 — Scaffolding
- [x] Repo directory skeleton (`frontend/`, `backend/`, `challenges/`, `decisions/`)
- [x] `tasks.md` created
- [x] `decisions/` created with initial architecture decisions recorded
- [x] Install vetted skills (vercel-react-best-practices, supabase-postgres-best-practices, multi-stage-dockerfile, docker-compose-orchestration)
- [x] `docker-compose.yml` + `docker-compose.override.yml` + `.env.example`
- [x] `backend/Dockerfile` (multi-stage) + minimal Express app with `GET /health`
- [x] `frontend/Dockerfile` (multi-stage, nginx) + minimal Vite React app with a health/landing page
- [x] `README.md` with local setup instructions + explicit security notes (docker.sock exposure, local-only)
- [x] Verify: `docker compose up` brings up all three services; backend and frontend health endpoints respond
      (verified both the dev override path — vite on :5173 — and the production nginx path on :3000; fixed two
      real bugs found during verification: nginx crashed on boot resolving the `backend` upstream before it was
      ready, fixed with a lazy `resolver`+variable `proxy_pass`; the `devops-trainer-challenges` network was
      silently dropped by Compose since no service attached to it, so it's removed from compose.yml with a note
      that `docker.service.ts` must create it via dockerode in Phase 2 instead)

## Phase 1 — Auth + DB
- [x] Migration tooling: plain numbered SQL files (`backend/migrations/`) + a small runner (`db/migrate.ts`) that
      tracks applied migrations in `schema_migrations` and runs automatically at backend boot — not node-pg-migrate,
      simpler for a single-developer project. First migration covers all 7 tables.
- [x] Seed script for the 10 fixed categories (`challenge.service.ts` `seedCategories()`, runs at boot; also
      exposed via `backend/scripts/seed-challenges.ts` for manual re-seeding, dev-only, not in the prod image)
- [x] `auth.service.ts` (bcryptjs + JWT) + `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- [x] `requireAuth` middleware
- [x] Minimal `AuthForm` (login/signup toggle) + `AuthContext` — no separate router/pages yet, kept to plain
      component state since Phase 2's job is proving the concept end-to-end, not UI polish (that's Phase 3)

## Phase 2 — Challenge framework + first working end-to-end challenge
- [x] `challenges/_schema/challenge.schema.json` + `challenge.service.ts` loader (`syncChallengesFromDisk`)
- [x] `docker.service.ts` (dockerode build/create/exec/destroy, network ensure, orphan reconciliation)
- [x] Reference challenge: `challenges/perm-config-blocks-service/` fully implemented — **redesigned mid-build**
      after live testing showed the original break (chmod 000 on nginx.conf) didn't work: nginx's master process
      runs as root and ignores file permissions entirely, so `sudo service nginx start` succeeded regardless. Fixed
      by breaking `/var/www/html` permissions instead — nginx's *worker* process drops to `www-data` (unprivileged)
      to actually serve files, so that permission barrier is real. See `decisions/0007-*.md`.
- [x] Sessions API (start, heartbeat, check, stop, hints, solution) + added `POST /api/sessions/:id/ws-ticket`
      (not in the original plan) to reissue a terminal ticket for an already-running session — needed once it
      became clear tickets expire in 60s and there was no way to reconnect (e.g. after a page refresh) without it.
- [x] WS terminal bridge (`ws/terminalSocket.ts`) + `TerminalPane` component (`@xterm/xterm` + `@xterm/addon-fit`)
- [ ] Early systemd-in-Docker smoke test — not yet done; deferred until a systemd-category challenge is authored
      in Phase 4, since the reference challenge didn't need `requires_systemd`
- [x] Manual verification: start → shell (confirmed running as non-root `trainee` with working passwordless sudo)
      → see break (403, confirmed via `ls`/`curl` inside the container) → fix live via the actual WS terminal bridge
      → check passes → progress/solved state updates → container torn down on stop. Driven via curl + a small
      Node WS test client (no real browser available in this environment) — open http://localhost:5173 to try it
      in an actual browser.

## Phase 3 — Frontend polish
- [ ] `ChallengeListPage` with category/difficulty/solved filters
- [ ] `ProgressDashboardPage`
- [ ] Markdown rendering for descriptions/solutions (currently rendered as plain `<pre>`/`white-space: pre-wrap`)
- [ ] react-query integration for server state
- [ ] Loading/error states throughout
- [ ] Resume an existing running session on mount/refresh (backend supports this via `POST /api/sessions/:id/ws-ticket`;
      frontend doesn't yet check for an existing active session when a challenge is opened, so refreshing the page
      mid-challenge currently loses the UI's session state even though the container itself is untouched)
- [ ] Proper page routing (currently plain component state in `App.tsx`, fine for one challenge, won't scale to
      Phase 3's full list/detail/dashboard navigation)

## Phase 4 — Bulk content authoring (~47 remaining challenges)
- [ ] Permissions & ownership (6 total, 5 remaining)
- [ ] Disk & filesystem (6 total, 5 remaining)
- [ ] Process & performance (5 total)
- [ ] Networking & DNS (5 total)
- [ ] systemd & services (6 total, 5 remaining)
- [ ] Logs & journald (4 total)
- [ ] Package management (4 total)
- [ ] Users/groups/sudo (5 total)
- [ ] Cron & scheduling (4 total)
- [ ] SSH & remote access (5 total)
- [ ] Each challenge smoke-tested (build, break-visible, check fails before fix / passes after) before being added to the seed script

## Phase 5 — Hardening
- [ ] Per-category resource-limit tuning
- [ ] Idle reaper + orphan reconciliation testing (simulate backend crash mid-session)
- [ ] Concurrency cap / one-session-per-user enforcement testing
- [ ] Structured logging
- [ ] Auth rate limiting
- [ ] Graceful shutdown on SIGTERM (drain sessions, close WS)
- [ ] Final security-notes documentation pass
- [ ] Challenge-authoring guide for future additions
