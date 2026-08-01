import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { startIdleReaper } from "./jobs/idleReaper.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { challengesRouter } from "./routes/challenges.routes.js";
import { helpRouter } from "./routes/help.routes.js";
import { progressRouter } from "./routes/progress.routes.js";
import { publicStatsRouter } from "./routes/publicStats.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { seedCategories, syncChallengesFromDisk } from "./services/challenge.service.js";
import { listLabeledContainerIds, reconcileOrphans } from "./services/docker.service.js";
import {
  drainAllActiveSessions,
  listActiveContainerIds,
  markOrphanedSessionsError,
} from "./services/session.service.js";
import { closeAllTerminals, handleUpgrade } from "./ws/terminalSocket.js";

const app = express();
// We sit behind the frontend's nginx; honor X-Forwarded-For so per-IP rate
// limiting and logging see the real client, not the proxy.
app.set("trust proxy", true);

// Security headers. Kept as early middleware so every response — including
// errors from errorHandler — gets them. The CSP below is deliberately hand
// -tuned rather than left on helmet's defaults: this frontend sets inline
// styles via `style={{...}}` and `element.style.setProperty(...)` for its
// hand-built spotlight-glow/tilt/magnetic-button/shiny-text/click-spark
// effects (see frontend/src for the `.style.setProperty` call sites), which
// a strict default `style-src` would silently break. See
// decisions/0035-http-security-headers-and-audit-fix.md for the full
// rationale behind every directive below.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // No third-party/CDN script is ever loaded (verified via grep) and
        // no inline <script> exists in index.html — helmet's 'self'-only
        // default is already correct, kept explicit here for clarity.
        "script-src": ["'self'"],
        // Inline `style` attributes are load-bearing for this app's hand
        // -built micro-interactions (React `style={{...}}` plus direct
        // `element.style.setProperty` for CSS custom properties driving
        // spotlight/tilt/magnetic-button/shiny-text/click-spark). Drop
        // helmet's default `https:` since no third-party stylesheet is ever
        // loaded — 'self' + 'unsafe-inline' is the minimal set that keeps
        // every one of those effects working.
        "style-src": ["'self'", "'unsafe-inline'"],
        // 'self' for built JS/CSS assets; `data:` for the one inline SVG
        // noise-texture background in styles.css (--texture-grain), the
        // only non-'self' image source anywhere in the frontend.
        "img-src": ["'self'", "data:"],
        // All @fontsource webfonts are self-hosted and served from the same
        // origin as the app (see index.html's preload links) — nothing
        // external or embedded is used, so drop helmet's default
        // `https:`/`data:` allowances entirely.
        "font-src": ["'self'"],
        // XHR/fetch to the API is same-origin; the terminal bridge
        // (TerminalPane.tsx) opens a WebSocket to the same host at
        // /ws/terminal using `${location.protocol === "https:" ? "wss" :
        // "ws"}://${location.host}/...` — same-origin but a different
        // scheme, so both `ws:` and `wss:` must be listed explicitly
        // alongside 'self' (this covers today's plain-HTTP/ws:// default
        // stack and a future TLS-terminated wss:// deployment identically).
        "connect-src": ["'self'", "ws:", "wss:"],
        // Nothing in this app is designed to be iframed by anything, ever.
        "frame-ancestors": ["'none'"],
        // Explicitly do NOT force http->https / ws->wss upgrades: the
        // default steady-state stack in this project is plain HTTP on
        // localhost with a ws:// terminal socket (see docker-compose.yml —
        // no TLS unless the opt-in Caddy overlay is used). Enabling this
        // directive would make browsers rewrite the terminal WebSocket's
        // `ws://` URL to `wss://`, breaking it against the default,
        // non-TLS-terminated stack. Setting a directive to `null` deletes
        // it from helmet's default set entirely (see helmet's
        // parseDirectives) rather than merely leaving it empty.
        "upgrade-insecure-requests": null,
      },
    },
    // No page in this app is meant to be framed by anything (verified: no
    // <iframe> usage anywhere), so DENY rather than helmet's default
    // 'sameorigin' — paired with the frame-ancestors 'none' CSP directive
    // above for browsers that honor both.
    frameguard: { action: "deny" },
    // Align the API's referrer policy with the one set for the static
    // frontend at the nginx layer (frontend/nginx.conf) for one coherent
    // app-wide policy, rather than leaving the backend on helmet's
    // (stricter, but inconsistent) "no-referrer" default.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/public-stats", publicStatsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/challenges", challengesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/progress", progressRouter);
app.use("/api/help", helpRouter);

app.use(errorHandler);

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

let reaperTimer: NodeJS.Timeout | undefined;

async function bootstrap(): Promise<void> {
  await runMigrations();
  await seedCategories();
  await syncChallengesFromDisk(path.join(process.cwd(), "challenges"));

  const dbActiveContainerIds = await listActiveContainerIds();
  await reconcileOrphans(dbActiveContainerIds);

  const liveContainerIds = await listLabeledContainerIds();
  await markOrphanedSessionsError(liveContainerIds);

  reaperTimer = startIdleReaper();

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  server.listen(port, () => {
    logger.info("backend listening", { port });
  });
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown initiated", { signal });

  // Stop background work and reject new HTTP/WS connections.
  if (reaperTimer) clearInterval(reaperTimer);
  closeAllTerminals();
  server.close(() => logger.info("http server closed"));

  // Hard deadline so a stuck container-stop can't hang the shutdown forever.
  const deadline = setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 20_000);
  deadline.unref();

  try {
    const drained = await drainAllActiveSessions();
    logger.info("drained active sessions", { count: drained });
    await pool.end();
    logger.info("shutdown complete");
    clearTimeout(deadline);
    process.exit(0);
  } catch (err) {
    logger.error("error during shutdown", { err });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

bootstrap().catch((err) => {
  logger.error("failed to start backend", { err });
  process.exit(1);
});
