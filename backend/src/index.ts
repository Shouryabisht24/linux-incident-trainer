import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { startIdleReaper } from "./jobs/idleReaper.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { challengesRouter } from "./routes/challenges.routes.js";
import { progressRouter } from "./routes/progress.routes.js";
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
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/challenges", challengesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/progress", progressRouter);

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
