# 0035 — HTTP security headers, npm audit fix, opt-in TLS overlay

## Decision

### 1. `helmet` for HTTP security headers, with a hand-tuned CSP

`helmet` was added to `backend/package.json` and wired in as the earliest middleware in `backend/src/index.ts`,
before `cors()`/`express.json()`. This is a deliberate exception to this project's general "no new dependencies"
discipline — same category as `nodemailer` earlier: a single-purpose, extremely well-established security library,
not UI/animation work.

Helmet's *default* Content-Security-Policy would break this app. The frontend's hand-built spotlight-glow/tilt/
magnetic-button/shiny-text/click-spark micro-interactions (`decisions/0030`, `0031`) set inline styles via React
`style={{...}}` and direct `element.style.setProperty(...)` calls — confirmed via `grep -rn style.setProperty
frontend/src` (7 files, 22 call sites, all CSS custom-property writes: `--tilt-x`/`--tilt-y`, `--magnet-x`/
`--magnet-y`, `--spot-x`/`--spot-y`, `--spark-x`/`--spark-y`). A strict `style-src` without `'unsafe-inline'` would
silently disable every one of these. The final directive set (`useDefaults: true` as a base, then explicit
overrides):

```
default-src 'self'; base-uri 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none';
img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none';
style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:
```

(`upgrade-insecure-requests`, present in helmet's defaults, is explicitly deleted — see below.)

Reasoning per directive:

- **`script-src 'self'`** — no third-party/CDN script is loaded anywhere in this app (verified: `grep` across
  `frontend/index.html` and `frontend/src` for `http(s)://`/`cdn.`/`googleapis`/etc. found nothing beyond
  same-origin references) and no inline `<script>` exists in `index.html` (only `<script type="module"
  src="/src/main.tsx">`). Helmet's own `'self'`-only default is already correct here.
- **`style-src 'self' 'unsafe-inline'`** — the load-bearing directive. Dropped helmet's default `https:` allowance
  since no third-party stylesheet is ever loaded; `'unsafe-inline'` is required to keep the inline-style effects
  above working. (CSP3's `style-src-attr` isn't set explicitly — per spec it falls back to `style-src`'s value
  when absent, which is exactly what's needed for the `style="..."` attributes React/direct DOM writes produce.)
- **`img-src 'self' data:'`** — `'self'` for built JS/CSS/image assets; `data:` specifically because
  `frontend/src/styles.css`'s `--texture-grain` custom property is an inline `data:image/svg+xml` noise texture
  used as a CSS `background` — the only non-`'self'` image source anywhere in the frontend (confirmed: no `<img>`
  tags exist in any `.tsx` file at all).
- **`font-src 'self'`** — all three `@fontsource` webfont packages (`ibm-plex-mono`, `ibm-plex-sans`, `overpass`)
  are self-hosted and served from the same origin as the app (see `index.html`'s `<link rel="preload">` entries
  and `vite.config.ts`'s deterministic font asset paths). Dropped helmet's default `https:`/`data:` allowances
  since nothing external or embedded is used.
- **`connect-src 'self' ws: wss:`** — same-origin XHR/fetch to the API, plus the terminal bridge
  (`frontend/src/components/TerminalPane.tsx`) opening a WebSocket to `${protocol}://${location.host}/ws/terminal`
  where `protocol` is `ws` or `wss` depending on the page's own scheme. Same origin, different URL scheme, so both
  need listing explicitly alongside `'self'`.
- **`frame-ancestors 'none'`** — nothing in this app is designed to be iframed by anything (confirmed: no
  `<iframe>` anywhere in the codebase), so there's no reason to allow even self-framing.
- **`upgrade-insecure-requests`: explicitly `null`** — setting a directive to `null` deletes it from helmet's
  default set entirely (see `parseDirectives` in `helmet`'s source), rather than merely emptying it. This
  directive, if left enabled, would make browsers rewrite the terminal WebSocket's `ws://` URL to `wss://` before
  connecting — breaking it against this project's actual default steady-state stack, which is plain HTTP with no
  TLS (`docker-compose.yml` has no TLS termination by default; see the opt-in overlay below). Silently forcing an
  upgrade the default stack can't serve would be a regression disguised as hardening.

Two more helmet options were set explicitly rather than left on defaults: `frameguard: { action: "deny" }` (helmet
defaults to `sameorigin`; nothing here needs even that, so `X-Frame-Options: DENY`, paired with the
`frame-ancestors 'none'` CSP directive above) and `referrerPolicy: { policy: "strict-origin-when-cross-origin" }`
(helmet defaults to the stricter `no-referrer`; overridden instead to match the policy set at the nginx layer
below, for one coherent app-wide referrer policy rather than two different ones on two layers with no functional
reason for the difference).

`frontend/nginx.conf` got the equivalent headers — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, and the same CSP string — added *only* inside the `location /`
block that serves the built static frontend. They are deliberately not set at the `server` level: nginx does not
merge server-level `add_header` directives into a location that defines its own, and per this pass's requirement,
the `/health`, `/api/`, `/ws/` locations that `proxy_pass` to the backend must carry zero nginx-added headers —
everything on those paths comes from the backend's own helmet config, unmodified. This was verified directly (see
Verification below): a request to `/` gets only nginx's headers; a request to `/api/public-stats` gets the
backend's full helmet header set passed through untouched.

### 2. `npm audit` fix: `dockerode` 4 → 5

Before: `npm audit` reported 2 moderate vulnerabilities — a `uuid` missing-buffer-bounds-check advisory
(GHSA-w5hq-g745-h8pq), pulled in transitively via `dockerode@4.0.12`'s own `uuid@^10.0.0` dependency. Plain `npm
audit fix` could not resolve this without bumping `dockerode` across a major version, and this project's own
CLAUDE.md flags `docker.service.ts`/`dockerode` as the single highest-risk integration point in the codebase — so
rather than force a blind major bump, the actual changelog was checked first.

`dockerode@5.0.0`'s release notes list exactly one breaking change: "dropped uuid package, bumped minimum node
version requirement." Confirmed directly via `npm view dockerode@5.0.1 dependencies` that `uuid` is gone from
5.0.1's dependency tree entirely (the library now uses Node's built-in `crypto.randomUUID` instead of an external
package) — this isn't a fix *of* the uuid vulnerability, it's the vulnerable dependency being removed outright.
The new minimum (`node >= 14.17`) is far below this project's `node:20-alpine` base image. Every dockerode API this
codebase actually calls in `docker.service.ts` — `listNetworks`, `createNetwork`, `listImages`, `buildImage` (with
`modem.followProgress`), `createContainer`, `getContainer().inspect/start/exec`, `modem.demuxStream`,
`listContainers` — is untouched by anything in the 4→5 changelog beyond the uuid/Node-version change.

Bumped `dockerode` to `^5.0.1` and `@types/dockerode` to `^4.0.1` (the current DefinitelyTyped major matching
dockerode's v4/v5-era API surface, since dockerode itself doesn't ship its own types). Result: **`npm audit` now
reports 0 vulnerabilities**, down from 2 moderate. Verified this didn't silently break the highest-risk
integration point: `npx tsc --noEmit` clean, the full unit suite (23 tests, including `docker.service.test.ts`'s
`imageTag`/`isNotModifiedOrMissing` coverage) passing, and the real integration suite against a live Postgres
container passing, all after a full `docker compose up --build -d` rebuild.

### 3. Opt-in TLS overlay via Caddy

`decisions/0001` already documents the docker-socket mount as a deliberate root-equivalent-to-host tradeoff,
accepted because this is a personal, local-only tool, with an explicit warning to never expose it beyond localhost
without a VPN/Tailscale layer in front. Until now there was no TLS story at all for anyone who does choose to do
that (behind a VPN, per the existing warning).

Added, as a fully opt-in overlay — **not** merged into `docker-compose.yml` or `docker-compose.override.yml**, so
the default steady-state stack (plain HTTP, no forced changes) keeps working exactly as it does today:

- `docker-compose.tls-example.yml` — adds a `caddy:2-alpine` service publishing 80/443, and clears the
  `frontend`/`backend` services' own host-published ports via Compose's `!reset` merge tag (`ports: !reset []`)
  so Caddy becomes the sole internet-facing entrypoint rather than leaving plain-HTTP 3000/4000 reachable
  alongside it. `!reset` requires Docker Compose v2.24.0+ (this host runs v5.3.0); the file documents the version
  requirement and the manual fallback (comment out the `ports:` lines in `docker-compose.yml` directly) for
  older installs. Verified with `docker compose -f docker-compose.yml -f docker-compose.tls-example.yml config`
  that the resolved config has no `ports:` left on `frontend`/`backend` and only Caddy publishes 80/443.
- `Caddyfile.example` — routes `/health`, `/api/*`, `/ws/*` to the backend and everything else to the frontend,
  matching `frontend/nginx.conf`'s own routing exactly so behavior is consistent regardless of which proxy
  terminates the connection. Caddy upgrades WebSocket connections automatically (no special config needed for the
  terminal bridge's `/ws/terminal` path).

**Why Caddy** over nginx+certbot: Caddy obtains and renews Let's Encrypt certificates itself via the HTTP-01
challenge with zero manual certificate management — no certbot install, no cron job, no renewal hook to get
wrong. The entire TLS configuration is the one `Caddyfile.example`; nginx+certbot would need a second container
or a cron-driven renewal script layered on top of the existing `frontend/nginx.conf`, considerably more moving
parts to document correctly for what's meant to be a copy-paste opt-in path.

README's existing "Security notes" section got a new "TLS / exposing beyond localhost (opt-in)" subsection added
alongside it (not replacing anything): states this is opt-in, requires a real domain name and reachable ports
80/443 for the HTTP-01 challenge, and explicitly reiterates — does not replace — the existing VPN/docker-socket
warnings. TLS termination only encrypts the transport between a browser and the host; it does nothing to the
backend's root-equivalent access to the host via `/var/run/docker.sock`. Anyone exposing this beyond their own LAN
still needs the VPN/Tailscale layer regardless of whether TLS is added.

## Verification

- `cd backend && npx tsc --noEmit` — clean.
- `cd backend && npm test` — 3 files, 23 tests, all passing (dockerode 5 upgrade didn't break
  `docker.service.test.ts`).
- `docker compose exec backend npm run test:integration` — 1 file, 6 tests, all passing against the real
  Postgres container.
- `cd frontend && npx tsc --noEmit` and `npm run build` — both clean.
- `docker compose up --build -d` — all three services healthy after the rebuild required for the new
  `helmet`/`dockerode` versions.
- Curled the real running backend directly and confirmed the exact intended CSP string, with no
  `upgrade-insecure-requests` and no unexpected directives.
- Re-verified both transport paths, per this project's established convention (a prior bug in this exact
  `nginx.conf` file, `decisions/0013`, once broke the WS path silently in production only): brought up the real
  production stack (`docker compose -f docker-compose.yml up --build -d`, no override, port 3000) and confirmed
  `/` returns only nginx's new headers (no helmet-specific extras, since that request never reaches the backend)
  while `/api/public-stats` returns the correct JSON *and* the backend's full helmet header set passed through
  unmodified — confirming nginx isn't double-setting or stripping anything on the proxied path. Restored the
  dev-override stack afterward and re-ran both test suites against it to confirm nothing regressed.

**What could not be verified**: no headless browser exists in this environment, so the CSP's actual *enforced*
runtime behavior — would a real browser really keep every inline-style effect working, would it really allow the
terminal WebSocket — could not be watched directly. What was verified instead: the exact header string leaving
both the backend and nginx matches the intended policy byte-for-byte, and every inline-style call site in the
frontend was traced against `style-src 'self' 'unsafe-inline'` and confirmed to be a plain CSS custom-property
write via `style={{...}}` or `.style.setProperty(...)` — nothing using `dangerouslySetInnerHTML`, inline
event-handler attributes, or a `<style>` tag exists anywhere in the frontend, which is the class of thing this
exact CSP would actually block.

## How to apply

Any new frontend asset source (a new external font, an analytics script, an embedded widget) needs a corresponding
CSP directive addition in *both* `backend/src/index.ts`'s helmet config and `frontend/nginx.conf`'s CSP header —
they're meant to stay in lockstep. Any new WebSocket or long-poll endpoint should already be covered by the
existing `connect-src 'self' ws: wss:'`. If TLS is ever made the default (not just opt-in), revisit whether
`upgrade-insecure-requests` should be re-enabled at that point — it was only removed because the *default* stack
today has no TLS termination.
