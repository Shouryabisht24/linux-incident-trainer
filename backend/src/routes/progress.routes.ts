import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const progressRouter = Router();

progressRouter.use(requireAuth);

progressRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const totals = await pool.query<{ total: number; solved: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE p.best_status = 'solved')::int AS solved
       FROM challenges c
       LEFT JOIN progress p ON p.challenge_id = c.id AND p.user_id = $1
       WHERE c.is_active = true`,
      [req.userId],
    );
    res.json(totals.rows[0]);
  }),
);
