# 0003 — One active live session per user

## Decision
Each user may have at most one active (starting/running/checking) live-container session at a time. Starting a new challenge automatically stops any previous running session for that user.

## Why
Confirmed with the user directly (over allowing multiple concurrent sessions). This is a personal/local single-machine tool, not a scaled SaaS, so bounding resource usage per user matters more than flexibility to juggle several in-progress challenges. It also keeps the UX and the backend session-management logic simpler — no need to reconcile "which of my N running containers am I looking at."

## How to apply
Enforced in `session.service.ts` at session-start: before creating a new container, look up any existing session for the user with `status IN ('starting','running','checking')` and tear it down first (same path as an explicit stop, marked `abandoned`). If this constraint ever needs to be relaxed (e.g. a future `MAX_CONCURRENT_SESSIONS > 1`), revisit this decision rather than silently allowing multiple.
