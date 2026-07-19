import { Router } from "express";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getChallengeBySlug, listChallenges } from "../services/challenge.service.js";
import { startSession } from "../services/session.service.js";
import { pool } from "../db/pool.js";

export const challengesRouter = Router();

challengesRouter.use(requireAuth);

challengesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const challenges = await listChallenges(req.userId!);
    res.json({
      challenges: challenges.map((c) => ({
        slug: c.slug,
        title: c.title,
        category: c.category_slug,
        categoryName: c.category_name,
        difficulty: c.difficulty,
        solved: c.solved,
      })),
    });
  }),
);

challengesRouter.get(
  "/:slug",
  asyncRoute(async (req, res) => {
    const challenge = await getChallengeBySlug(req.params.slug);
    if (!challenge || !challenge.is_active) {
      res.status(404).json({ error: "challenge not found" });
      return;
    }
    const hintCount = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM hints WHERE challenge_id = $1", [
      challenge.id,
    ]);
    res.json({
      slug: challenge.slug,
      title: challenge.title,
      category: challenge.category_slug,
      categoryName: challenge.category_name,
      difficulty: challenge.difficulty,
      descriptionMd: challenge.description_md,
      timeLimitMinutes: challenge.time_limit_minutes,
      hintCount: hintCount.rows[0].n,
    });
  }),
);

challengesRouter.post(
  "/:slug/sessions",
  asyncRoute(async (req, res) => {
    const result = await startSession(req.userId!, req.params.slug);
    res.status(201).json(result);
  }),
);
