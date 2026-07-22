import { Router } from "express";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clientIp, rateLimit } from "../middleware/rateLimit.js";
import { getUserById, login, signup } from "../services/auth.service.js";

export const authRouter = Router();

// Brute-force / credential-stuffing protection on the auth endpoints. Login is
// keyed by IP+email so one account being hammered can't lock out others sharing
// an IP; signup is keyed by IP. Tunable via env; defaults suit a personal tool.
const loginLimiter = rateLimit({
  name: "login",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_LOGIN_MAX ?? 10),
  keyFn: (req) => `${clientIp(req)}:${String((req.body ?? {}).email ?? "").toLowerCase()}`,
});
const signupLimiter = rateLimit({
  name: "signup",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_SIGNUP_MAX ?? 5),
  keyFn: (req) => clientIp(req),
});

authRouter.post(
  "/signup",
  signupLimiter,
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
  loginLimiter,
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
