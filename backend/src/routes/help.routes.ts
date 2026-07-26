import { Router } from "express";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clientIp, rateLimit } from "../middleware/rateLimit.js";
import { listHelpRequestsForUser, submitHelpRequest } from "../services/help.service.js";

export const helpRouter = Router();
helpRouter.use(requireAuth);

const helpSubmitLimiter = rateLimit({
  name: "help-submit",
  windowMs: Number(process.env.HELP_RATE_WINDOW_MS ?? 60 * 60 * 1000),
  max: Number(process.env.HELP_SUBMIT_MAX ?? 5),
  keyFn: (req) => req.userId ?? clientIp(req),
});

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 4000;

helpRouter.post(
  "/",
  helpSubmitLimiter,
  asyncRoute(async (req, res) => {
    const { subject, message } = req.body ?? {};
    const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    if (!trimmedSubject || !trimmedMessage) {
      res.status(400).json({ error: "subject and message are required" });
      return;
    }
    if (trimmedSubject.length > SUBJECT_MAX || trimmedMessage.length > MESSAGE_MAX) {
      res.status(400).json({ error: `subject must be under ${SUBJECT_MAX} chars, message under ${MESSAGE_MAX}` });
      return;
    }
    const helpRequest = await submitHelpRequest(req.userId!, trimmedSubject, trimmedMessage);
    res.status(201).json({ helpRequest });
  }),
);

helpRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const helpRequests = await listHelpRequestsForUser(req.userId!);
    res.json({ helpRequests });
  }),
);
