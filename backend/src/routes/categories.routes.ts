import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const result = await pool.query("SELECT slug, name, description FROM categories ORDER BY sort_order");
    res.json({ categories: result.rows });
  }),
);
