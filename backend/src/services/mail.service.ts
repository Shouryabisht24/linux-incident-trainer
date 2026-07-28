import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../lib/logger.js";

// Self-hosters won't necessarily have SMTP configured on day one, and the rest of the app
// (challenges, terminal, progress) has nothing to do with email — so a missing SMTP_HOST must
// never crash boot. We build the transporter lazily on first send, warn exactly once, and no-op
// afterward rather than throwing.
let transporter: Transporter | null | undefined; // undefined = not yet resolved, null = unconfigured
let warnedOnce = false;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn(
        "SMTP_HOST is not set — password-reset emails will be logged, not sent. Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM to enable real delivery.",
      );
    }
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const client = getTransporter();
  if (!client) {
    // No SMTP configured: this is a self-hosted personal tool, so log the link rather than
    // silently dropping it — lets an operator without email set up still complete the flow.
    logger.info("password reset requested (SMTP not configured, link logged instead of emailed)", { to, resetUrl });
    return;
  }

  const from = process.env.SMTP_FROM || "Linux Incident Trainer <no-reply@localhost>";
  await client.sendMail({
    to,
    from,
    subject: "Reset your Linux Incident Trainer password",
    text: `Someone requested a password reset for this account. If this was you, reset your password here (link expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Someone requested a password reset for this account. If this was you, reset your password using the link below (expires in 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
  });
}
