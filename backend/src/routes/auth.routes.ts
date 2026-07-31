import { Router } from "express";
import { logger } from "../lib/logger.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clientIp, rateLimit } from "../middleware/rateLimit.js";
import {
  changePassword,
  deleteOwnAccount,
  getUserById,
  login,
  requestPasswordReset,
  resetPasswordWithToken,
  signup,
  updateDisplayName,
} from "../services/auth.service.js";

export const authRouter = Router();

// Defense in depth: the frontend already blocks spaces from ever being typed/pasted into the
// email/password fields, but that's client-side and trivially bypassed by anyone hitting the API
// directly — so reject the same condition here regardless of how the request was made.
const HAS_WHITESPACE = /\s/;

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

// Password change is a sensitive account-mutation action, same threat model as login (someone with
// a stolen session token trying to brute-force the current password to lock the real owner out).
// Keyed per-user (req.userId, set by requireAuth which always runs first in the chain below) rather
// than per-IP, since the whole point is limiting attempts against *one account* regardless of which
// IP they come from.
const changePasswordLimiter = rateLimit({
  name: "change-password",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_CHANGE_PASSWORD_MAX ?? 5),
  keyFn: (req) => req.userId ?? clientIp(req),
});

// Forgot-password is keyed by IP+email, same reasoning as loginLimiter: one email being hammered
// (an attacker spraying reset requests at a known victim address) shouldn't lock out other users
// behind the same IP, and one IP spraying many emails still gets bucketed per-email so it doesn't
// take unbounded attempts across different victims either — each (ip, email) pair gets its own
// budget.
const forgotPasswordLimiter = rateLimit({
  name: "forgot-password",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_FORGOT_PASSWORD_MAX ?? 5),
  keyFn: (req) => `${clientIp(req)}:${String((req.body ?? {}).email ?? "").toLowerCase()}`,
});

// Reset-password has no identity to key on yet (the token itself is the only credential, and we
// don't want to decode/validate it just to build a rate-limit key) — keyed by IP alone, same as
// signupLimiter.
const resetPasswordLimiter = rateLimit({
  name: "reset-password",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_RESET_PASSWORD_MAX ?? 10),
  keyFn: (req) => clientIp(req),
});

// Account deletion is a destructive, sensitive action gated on the current password — same threat
// model and per-user keying as changePasswordLimiter.
const deleteAccountLimiter = rateLimit({
  name: "delete-account",
  windowMs: Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_DELETE_ACCOUNT_MAX ?? 5),
  keyFn: (req) => req.userId ?? clientIp(req),
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
    if (HAS_WHITESPACE.test(email) || HAS_WHITESPACE.test(password)) {
      res.status(400).json({ error: "email and password must not contain whitespace" });
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
    if (HAS_WHITESPACE.test(email) || HAS_WHITESPACE.test(password)) {
      res.status(400).json({ error: "email and password must not contain whitespace" });
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

authRouter.post(
  "/change-password",
  requireAuth,
  changePasswordLimiter,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "current password and a new password (min 8 chars) are required" });
      return;
    }
    if (HAS_WHITESPACE.test(newPassword)) {
      res.status(400).json({ error: "new password must not contain whitespace" });
      return;
    }
    try {
      await changePassword(req.userId!, currentPassword, newPassword);
    } catch {
      // Don't leak more than necessary: any failure here (wrong current password, user not found)
      // reports the same generic "current password is incorrect" — never distinguishes account
      // existence or hash-comparison internals to the client.
      res.status(400).json({ error: "current password is incorrect" });
      return;
    }
    res.json({ ok: true });
  }),
);

authRouter.patch(
  "/display-name",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { displayName } = req.body ?? {};
    if (displayName !== null && typeof displayName !== "string") {
      res.status(400).json({ error: "displayName must be a string or null" });
      return;
    }
    const trimmed = typeof displayName === "string" ? displayName.trim() : null;
    const user = await updateDisplayName(req.userId!, trimmed || null);
    res.json({ user });
  }),
);

authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter,
  asyncRoute(async (req, res) => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || email.length === 0) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    // Hard security requirement: this response must never differ based on whether the account
    // exists, whether the email send succeeded, or any other internal outcome — always 200.
    await requestPasswordReset(email).catch(() => {});
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/reset-password",
  resetPasswordLimiter,
  asyncRoute(async (req, res) => {
    const { token, newPassword } = req.body ?? {};
    if (typeof token !== "string" || token.length === 0 || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "a reset token and a new password (min 8 chars) are required" });
      return;
    }
    if (HAS_WHITESPACE.test(newPassword)) {
      res.status(400).json({ error: "new password must not contain whitespace" });
      return;
    }
    try {
      await resetPasswordWithToken(token, newPassword);
    } catch {
      // One generic message for every failure mode (no matching token, already used, expired) —
      // never lets a caller distinguish which, same reasoning as resetPasswordWithToken itself.
      res.status(400).json({ error: "invalid or expired reset link" });
      return;
    }
    res.json({ ok: true });
  }),
);

authRouter.delete(
  "/me",
  requireAuth,
  deleteAccountLimiter,
  asyncRoute(async (req, res) => {
    const { currentPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      res.status(400).json({ error: "current password is required" });
      return;
    }
    try {
      await deleteOwnAccount(req.userId!, currentPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "current password is incorrect" || message === "user not found") {
        // Same generic style as /change-password: never distinguish "wrong password" from
        // "account not found" beyond this one message.
        res.status(400).json({ error: "current password is incorrect" });
        return;
      }
      // Anything else (most likely: the user's live challenge container failed to tear down —
      // see deleteOwnAccount's docstring) is an operational failure, not a bad password guess.
      // Reusing the "current password is incorrect" message here would send the user to retype a
      // password that was already correct; fail loudly instead so they know to retry.
      logger.error("account deletion failed", { userId: req.userId, err });
      res.status(500).json({ error: "failed to delete account, please try again" });
      return;
    }
    res.json({ ok: true });
  }),
);
