import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncRoute } from "../middleware/errorHandler.js";

// Deliberately unauthenticated: powers the animated stat counters on the
// public marketing/landing page (challenge count, category count only —
// no user data, no PII). See decisions/0012-public-stats-endpoint.md.
export const publicStatsRouter = Router();

publicStatsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const [challengeResult, categoryResult] = await Promise.all([
      pool.query<{ n: number }>("SELECT count(*)::int AS n FROM challenges WHERE is_active = true"),
      pool.query<{ n: number }>("SELECT count(*)::int AS n FROM categories"),
    ]);
    res.json({
      challengeCount: challengeResult.rows[0].n,
      categoryCount: categoryResult.rows[0].n,
    });
  }),
);
