# 0013 — Fixed a pre-existing nginx `proxy_pass` bug that broke every `/api/*` and `/ws/*` route in real production mode

## Decision
While verifying the new landing page's `/api/public-stats` call against the actual production (nginx-served)
build — not just the dev override's Vite proxy — discovered that `frontend/nginx.conf`'s `/api/` and `/ws/`
locations were silently broken for any request with a path segment beyond the location prefix. Fixed by dropping
the literal URI suffix from each `proxy_pass` directive.

Before:
```
location /api/ {
    set $upstream_backend http://backend:4000;
    proxy_pass $upstream_backend/api/;
    ...
}
```
After:
```
location /api/ {
    set $upstream_backend http://backend:4000;
    proxy_pass $upstream_backend;
    ...
}
```
(Same change applied to `/health` and `/ws/`.)

## Why this was broken
nginx's `proxy_pass` has a documented special case: once the target uses a variable (`$upstream_backend`,
required here so nginx re-resolves the `backend` service name lazily per request instead of caching a stale IP
or refusing to start if `backend` isn't up yet — see the resolver comment already in the file), pairing that
variable with a literal URI (`/api/`) does **not** splice the matched location prefix back into the upstream
request the way a static (non-variable) `proxy_pass` would. Instead it replaces the **entire** incoming request
URI with that literal string. So `GET /api/categories` was actually forwarded upstream as bare `GET /api/`,
`GET /api/challenges/foo/sessions` as `GET /api/`, and — worse — `GET /ws/terminal?ticket=...` (the terminal
bridge's WS upgrade request) as `GET /ws/`, i.e. the WebSocket bridge was silently broken in real production too.

This had gone unnoticed because:
- Local dev always runs through `docker-compose.override.yml`, which points the frontend at Vite's dev server on
  :5173. Vite's own `server.proxy` config (`vite.config.ts`) forwards the full original path correctly, so every
  manual test and every prior WS verification in `tasks.md` (Phase 2/3) exercised *that* path, not nginx's.
- The one thing that happened to look fine through nginx was `GET /health` — a location with no nested path
  under it, so replacing the URI with the literal `/health` coincidentally produces the same request.

## How this was found and verified
Confirmed the bug first on an *existing, untouched* endpoint (`GET /api/categories` returned nginx's generic
"Cannot GET /api/" 404 through `docker compose -f docker-compose.yml up --build -d frontend`, i.e. the real
prod image on port 3000, before touching nginx.conf), so this is not something introduced by this change — it
predates the landing page work. After the fix: `/api/categories` correctly returns `401` (reaches
`requireAuth`), `/api/public-stats` returns real data with no token, `POST /api/auth/signup` → `GET
/api/challenges` → `GET /api/auth/me` all work end-to-end through nginx with a real bearer token, and a raw
Node `ws` client connecting to `ws://localhost:3000/ws/terminal?ticket=...` (the real ticket flow, exercised
through nginx rather than Vite) got a `101` upgrade and received real terminal bytes back. Test users and the
one challenge container spawned during this check were cleaned up afterward.

## How to apply
Any future nginx location added for this app that both (a) needs the lazy-resolver `set $var http://...;` +
`proxy_pass $var;` pattern and (b) should forward the client's full sub-path, must **not** append a literal URI
after the variable in `proxy_pass` — leave it as `proxy_pass $var;` with nothing after it.
