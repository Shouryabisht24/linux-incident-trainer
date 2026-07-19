import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import { runMigrations } from "./db/migrate.js";
import { startIdleReaper } from "./jobs/idleReaper.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { challengesRouter } from "./routes/challenges.routes.js";
import { progressRouter } from "./routes/progress.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { seedCategories, syncChallengesFromDisk } from "./services/challenge.service.js";
import { listLabeledContainerIds, reconcileOrphans } from "./services/docker.service.js";
import { listActiveContainerIds, markOrphanedSessionsError } from "./services/session.service.js";
import { handleUpgrade } from "./ws/terminalSocket.js";

const app = express();
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

async function bootstrap(): Promise<void> {
  await runMigrations();
  await seedCategories();
  await syncChallengesFromDisk(path.join(process.cwd(), "challenges"));

  const dbActiveContainerIds = await listActiveContainerIds();
  await reconcileOrphans(dbActiveContainerIds);

  const liveContainerIds = await listLabeledContainerIds();
  await markOrphanedSessionsError(liveContainerIds);

  startIdleReaper();

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  server.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("failed to start backend:", err);
  process.exit(1);
});
