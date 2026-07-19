# 0004 — Lazy, cached challenge image builds

## Decision
Challenge Docker images are built the first time any user starts that challenge, then reused from the local image cache on subsequent starts. There is no upfront "build all ~50 images" step in the base implementation.

## Why
Confirmed with the user directly (over prebuilding all images upfront). Lazy build keeps Phase 0–3 simple (no prebuild pipeline to write and maintain) and avoids a slow first-run setup experience while there are only a handful of challenges. The cost — the first user to ever start a given challenge eats a build delay (seconds up to ~1 min depending on base image) — is acceptable for a personal tool.

## How to apply
`docker.service.ts` checks for an existing image tagged `devops-trainer/<slug>:<content_version>` before falling back to `buildImage()`. Bumping a challenge's `content_version` in `challenge.json` forces a rebuild (old tag becomes stale/unused).

If first-use latency becomes annoying once more challenges exist (Phase 4/5), add `backend/src/jobs/imagePrebuilder.ts` to warm the cache at backend startup — that was scoped in the plan as a later addition, not a Phase 0 requirement. Revisit this decision if prebuilding becomes the default rather than an opt-in warmup.
