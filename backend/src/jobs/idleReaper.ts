import { logger } from "../lib/logger.js";
import { reapIdleSessions } from "../services/session.service.js";

const INTERVAL_MS = 30_000;

export function startIdleReaper(): NodeJS.Timeout {
  return setInterval(() => {
    reapIdleSessions().catch((err) => logger.error("idle reaper error", { err }));
  }, INTERVAL_MS);
}
