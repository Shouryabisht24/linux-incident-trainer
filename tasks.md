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
- [ ] Migration tooling chosen (node-pg-migrate) + first migration for all 7 tables
- [ ] Seed script for the 10 fixed categories
- [ ] `auth.service.ts` (bcrypt + JWT) + `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- [ ] `requireAuth` middleware
- [ ] Minimal `LoginPage` / `SignupPage` + `AuthContext`

## Phase 2 — Challenge framework + first working end-to-end challenge
- [ ] `challenges/_schema/challenge.schema.json` + `challenge.service.ts` loader
- [ ] `docker.service.ts` (dockerode build/create/exec/destroy)
- [ ] Reference challenge: `challenges/perm-config-blocks-service/` fully implemented
- [ ] Sessions API (`POST /api/challenges/:slug/sessions`, heartbeat, check, stop, hints, solution)
- [ ] WS terminal bridge (`ws/terminalSocket.ts`) + `TerminalPane` component
- [ ] Early systemd-in-Docker smoke test (risk check for the systemd category)
- [ ] Manual verification: start → shell → see break → fix → check passes → progress recorded → teardown

## Phase 3 — Frontend polish
- [ ] `ChallengeListPage` with category/difficulty/solved filters
- [ ] `ProgressDashboardPage`
- [ ] Markdown rendering for descriptions/solutions
- [ ] react-query integration for server state
- [ ] Loading/error states throughout

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
