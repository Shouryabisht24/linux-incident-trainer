import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool.js";
import { logger } from "../lib/logger.js";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

/**
 * Compose's `depends_on: condition: service_healthy` only guarantees postgres
 * itself is ready before this container *starts* — it does not guarantee this
 * container's own network/DNS stack is ready the instant its process runs.
 * On a freshly created network (e.g. the first `docker compose up` ever, or
 * any run under a new project name) that race is real and reproducible: the
 * first connection attempt can fail with `getaddrinfo EAI_AGAIN postgres`
 * even though postgres is healthy and "postgres" resolves fine a moment
 * later. Retry with backoff before giving up, rather than crashing the whole
 * backend on a transient startup race.
 */
async function waitForDatabase(maxAttempts = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      logger.warn("database not ready yet, retrying", {
        attempt,
        maxAttempts,
        err: err instanceof Error ? err.message : err,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function runMigrations(): Promise<void> {
  await waitForDatabase();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info("migration applied", { file });
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration failed: ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
