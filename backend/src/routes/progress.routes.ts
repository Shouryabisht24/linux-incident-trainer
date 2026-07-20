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

    // Per-category breakdown, added for the Phase 3 progress dashboard so the
    // frontend doesn't have to derive it client-side from data it doesn't have
    // (see decisions/0008-*.md). Includes categories with zero challenges as
    // total: 0 so the UI can still list all 10 fixed categories consistently.
    const byCategory = await pool.query<{
      slug: string;
      name: string;
      total: number;
      solved: number;
    }>(
      `SELECT cat.slug, cat.name,
              count(c.id) FILTER (WHERE c.is_active = true)::int AS total,
              count(c.id) FILTER (WHERE c.is_active = true AND p.best_status = 'solved')::int AS solved
       FROM categories cat
       LEFT JOIN challenges c ON c.category_id = cat.id
       LEFT JOIN progress p ON p.challenge_id = c.id AND p.user_id = $1
       GROUP BY cat.id, cat.slug, cat.name, cat.sort_order
       ORDER BY cat.sort_order`,
      [req.userId],
    );

    res.json({ ...totals.rows[0], categories: byCategory.rows });
  }),
);
