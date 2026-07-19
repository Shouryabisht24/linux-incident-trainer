import { Router } from "express";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getUserById, login, signup } from "../services/auth.service.js";

export const authRouter = Router();

authRouter.post(
  "/signup",
  asyncRoute(async (req, res) => {
    const { email, password, displayName } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "email and password (min 8 chars) are required" });
      return;
    }
    const { user, token } = await signup(email, password, displayName);
    res.status(201).json({ user, token });
  }),
);

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const { user, token } = await login(email, password);
    res.json({ user, token });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    res.json({ user });
  }),
);
