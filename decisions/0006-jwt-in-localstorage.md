# 0006 — JWT stored in localStorage, short-lived WS tickets for the terminal socket

## Decision
The frontend stores the auth JWT in `localStorage` and sends it as a `Bearer` header on API requests. The WebSocket terminal connection does NOT reuse that JWT directly — browsers can't set custom headers on a WebSocket upgrade — so `POST /api/challenges/:slug/sessions` returns a separate short-lived (60s) signed ticket scoped to one `sessionId`, which is passed as a query param on the `wss://.../ws/terminal` URL.

## Why
- **JWT in localStorage vs. httpOnly cookie:** localStorage is pragmatic and simple to implement; it carries a known XSS-token-theft exposure, but that's an acceptable tradeoff for a personal local tool with no public exposure (see [[0001-docker-outside-of-docker]] for the broader "local-only" posture). httpOnly cookies + CSRF protection would be more defense-in-depth but add complexity not justified here.
- **Separate short-lived WS ticket instead of the long-lived JWT in the URL:** avoids leaking the long-lived credential into server logs, browser history, or Referer headers via a URL query string. The ticket is single-purpose, expires in 60s, and is scoped to one session, so even if logged it's low-value.

## How to apply
Never put the long-lived JWT itself in a URL (query param) anywhere, including the WS upgrade. Ticket issuance and validation live in `session.service.ts` (issue) and `ws/terminalSocket.ts` (validate). If this app ever needs to be exposed beyond localhost, revisit the localStorage-JWT choice specifically — that's the piece most affected by a real public-network threat model.
