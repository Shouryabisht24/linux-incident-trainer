# 0014 — Retry the initial database connection at boot instead of crashing immediately

## Decision
`runMigrations()` now calls a `waitForDatabase()` helper first, which retries `SELECT 1` up to 10 times with a 1s delay before giving up. Previously the backend attempted its first DB query immediately at boot with no retry, and any failure crashed the process (`process.exit(1)` in `index.ts`'s `bootstrap().catch(...)`).

## Why
Found while independently verifying the Phase 4/5 agent's work and the landing-page agent's nginx fix, by booting a fully isolated stack (`docker compose -f docker-compose.yml -p linux-incident-trainer-prodcheck up`) on a brand-new Docker network. The backend crashed on `getaddrinfo EAI_AGAIN postgres` on 3 consecutive attempts — 100% reproducible, not a one-off flake. A one-off `docker compose run` container on the same network resolved "postgres" fine, and DNS worked again moments later — so this is a startup-race specific to how the `backend` service's own container starts, not a general DNS problem. `depends_on: condition: service_healthy` (already in place, see `docker-compose.yml`) guarantees postgres itself is healthy before backend *starts*, but does not guarantee backend's own network/DNS stack is ready in the same instant its process begins running. That race is most likely to bite on exactly the scenario a real user hits hardest: the very first `docker compose up` ever, on a freshly created network — which is exactly what this test reproduced.

This was missed by the Phase 5 hardening pass because that pass tested crash-recovery *mid-session* (killing the backend while a challenge was running, on an already-established network) but never tested a cold boot on a brand-new network, which is the specific condition that exposes this race.

## How to apply
Any code that runs before the first successful DB query at boot should go through `waitForDatabase()` (or an equivalent retry), not assume the connection succeeds on the first try. If a future change adds another service dependency at boot (e.g. some other datastore), give it the same treatment rather than a bare first attempt.
