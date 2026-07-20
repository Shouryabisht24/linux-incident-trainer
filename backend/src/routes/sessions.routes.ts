import { Router } from "express";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  checkSession,
  getActiveSessionForUser,
  getHintsState,
  getSessionForUser,
  getSolution,
  heartbeat,
  issueWsTicket,
  revealNextHint,
  stopSession,
} from "../services/session.service.js";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

// Registered before "/:id" so the literal path wins over the param route.
sessionsRouter.get(
  "/active",
  asyncRoute(async (req, res) => {
    const session = await getActiveSessionForUser(req.userId!);
    res.json({ session });
  }),
);

sessionsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const session = await getSessionForUser(req.params.id, req.userId!);
    res.json({ session });
  }),
);

sessionsRouter.post(
  "/:id/ws-ticket",
  asyncRoute(async (req, res) => {
    const session = await getSessionForUser(req.params.id, req.userId!);
    if (!["running", "checking"].includes(session.status)) {
      res.status(409).json({ error: "session is not running" });
      return;
    }
    res.json({ wsTicket: issueWsTicket(session.id, req.userId!), expiresInSeconds: 60 });
  }),
);

sessionsRouter.post(
  "/:id/heartbeat",
  asyncRoute(async (req, res) => {
    await heartbeat(req.params.id, req.userId!);
    res.json({ ok: true });
  }),
);

sessionsRouter.post(
  "/:id/check",
  asyncRoute(async (req, res) => {
    const result = await checkSession(req.params.id, req.userId!);
    res.json(result);
  }),
);

sessionsRouter.post(
  "/:id/stop",
  asyncRoute(async (req, res) => {
    await stopSession(req.params.id, req.userId!, "abandoned");
    res.json({ ok: true });
  }),
);

sessionsRouter.get(
  "/:id/hints",
  asyncRoute(async (req, res) => {
    const result = await getHintsState(req.params.id, req.userId!);
    res.json(result);
  }),
);

sessionsRouter.post(
  "/:id/hints/reveal",
  asyncRoute(async (req, res) => {
    const result = await revealNextHint(req.params.id, req.userId!);
    res.json(result);
  }),
);

sessionsRouter.get(
  "/:id/solution",
  asyncRoute(async (req, res) => {
    const solutionMd = await getSolution(req.params.id, req.userId!);
    res.json({ solutionMd });
  }),
);
