import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { sendPasswordResetEmail } from "./mail.service.js";
import { getActiveSessionForUser, stopSession } from "./session.service.js";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

interface UserRow extends User {
  password_hash: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_TOKEN_EXPIRY = "7d";
const BCRYPT_ROUNDS = 10;

/** Thin, testable wrapper around bcrypt's hash — the one place a new password hash is minted. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Thin, testable wrapper around bcrypt's compare — the one place a password is checked against a hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "auth" }, JWT_SECRET, { expiresIn: AUTH_TOKEN_EXPIRY });
}

/**
 * Verifies an auth JWT's signature/expiry/shape, then enforces server-side invalidation: a token
 * whose `iat` (issued-at, seconds since epoch, set automatically by jsonwebtoken) predates the
 * user's `password_changed_at` is rejected even though the JWT itself is still cryptographically
 * valid and unexpired. This is what makes "change your password because you suspect your session
 * was compromised" actually do something — without it, a stolen-but-not-yet-expired token would
 * keep working for up to 7 days after the legitimate user "secured" their account. `NULL`
 * `password_changed_at` (never changed since signup) means every token for that user is accepted
 * on its signature/expiry alone, same as before this check existed.
 */
export async function verifyAuthToken(token: string): Promise<{ userId: string }> {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== "auth" || typeof payload.sub !== "string" || typeof payload.iat !== "number") {
    throw new Error("invalid token type");
  }

  const result = await pool.query<{ password_changed_at: string | null }>(
    "SELECT password_changed_at FROM users WHERE id = $1",
    [payload.sub],
  );
  const row = result.rows[0];
  if (!row) throw new Error("user not found");

  if (row.password_changed_at) {
    const changedAtSeconds = Math.floor(new Date(row.password_changed_at).getTime() / 1000);
    if (payload.iat < changedAtSeconds) {
      throw new Error("token issued before most recent password change");
    }
  }

  return { userId: payload.sub };
}

export async function signup(
  email: string,
  password: string,
  displayName: string | undefined,
): Promise<{ user: User; token: string }> {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rowCount) {
    throw new Error("email already registered");
  }

  const passwordHash = await hashPassword(password);
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, created_at`,
    [email, passwordHash, displayName ?? null],
  );
  const user = toUser(result.rows[0]);
  return { user, token: signAuthToken(user.id) };
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const result = await pool.query<UserRow>(
    "SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  if (!row) throw new Error("invalid email or password");

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) throw new Error("invalid email or password");

  return { user: toUser(row), token: signAuthToken(row.id) };
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    "SELECT id, email, password_hash, display_name, created_at FROM users WHERE id = $1",
    [userId],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

/**
 * Changes a user's password. Requires the current password and verifies it via `verifyPassword`
 * against the stored hash first — there is no path to change a password without proving the
 * current one. Throws a generic "current password is incorrect" error on mismatch (never reveals
 * whether the account itself exists or anything about the stored hash). Also stamps
 * `password_changed_at = now()` in the same statement, which `verifyAuthToken` uses to reject any
 * already-issued JWT older than this change — see that function's docstring.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const result = await pool.query<UserRow>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("user not found");

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) throw new Error("current password is incorrect");

  const newHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2", [
    newHash,
    userId,
  ]);
}

/**
 * Updates a user's display name only. No password verification needed — this is a harmless
 * profile-cosmetics field, not a security-sensitive credential, same as at signup where it's
 * accepted with no extra proof of identity beyond the signup flow itself.
 */
export async function updateDisplayName(userId: string, displayName: string | null): Promise<User> {
  const result = await pool.query<UserRow>(
    `UPDATE users SET display_name = $1 WHERE id = $2
     RETURNING id, email, password_hash, display_name, created_at`,
    [displayName, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("user not found");
  return toUser(row);
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, display_name: row.display_name, created_at: row.created_at };
}

// ---------------------------------------------------------------------------
// Password reset (forgot-password flow)
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Looks up the account by email and, if found, issues a single-use password-reset token and
 * emails a reset link. **Critical security property**: this must never let a caller distinguish
 * "no such account" from "email sent" — the calling route always returns the same 200 regardless
 * of what happens in here. To keep the control flow (and rough timing) as similar as possible
 * between the two branches, we always generate the token/hash/URL first and only branch on
 * whether to persist+send; a nonexistent-account call still performs an equivalent DB round trip
 * rather than returning immediately. We deliberately don't fake an outbound SMTP send in the
 * no-such-account branch — a real network call there would be wasted work with its own timing
 * variance, and cryptographic random-token generation, not a slow legitimate email round trip, is
 * the operation that actually matters to keep symmetric here.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const result = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const user = result.rows[0];

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  if (user) {
    await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [
      user.id,
      tokenHash,
      expiresAt,
    ]);
    await sendPasswordResetEmail(email, resetUrl);
  } else {
    // Equivalent-cost no-op DB round trip so this branch doesn't resolve conspicuously faster
    // than the real-user branch above.
    await pool.query("SELECT 1");
  }
}

/**
 * Consumes a password-reset token: hashes the provided plaintext token, finds a matching
 * not-yet-used, not-yet-expired row, and — in the same transaction — updates the user's password
 * and marks the token used (`used_at = now()`), so it can never be replayed. Throws a single
 * generic "invalid or expired reset link" error for every failure mode (no matching row, already
 * used, expired) — a legitimate user just needs to know to request a new link, and an attacker
 * gains nothing by which failure they hit. Also stamps `password_changed_at = now()` (same
 * reasoning as `changePassword`) so a reset — exactly the flow used when an account is suspected
 * compromised — actually invalidates any already-issued JWT rather than leaving it valid.
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashResetToken(token);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("invalid or expired reset link");

    const newHash = await hashPassword(newPassword);
    await client.query("UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2", [
      newHash,
      row.user_id,
    ]);
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [row.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Permanently deletes the caller's own account. Requires re-proving the current password first
 * (same non-negotiable pattern as `changePassword` — no destructive action without it), then tears
 * down any live challenge container/session before the row goes away (the DB cascade alone would
 * orphan a running Docker container — deleting the `sessions` row doesn't stop the container
 * behind it), then deletes the user row. Every other user-owned row (`sessions`, `progress`,
 * `check_attempts` via `sessions`, `help_requests`, `password_reset_tokens`) cascades via each
 * table's `ON DELETE CASCADE user_id`/`session_id` FK — see 0001_init.sql, 0003_help_requests.sql,
 * and this feature's own 0004_password_reset_tokens.sql.
 *
 * The container-teardown call below is deliberately NOT wrapped in `.catch(() => {})`: if it
 * throws, this function throws too and the user row is never deleted. Swallowing that error would
 * let `DELETE FROM users` proceed anyway; the `sessions` row's `ON DELETE CASCADE user_id` would
 * then vanish along with the only DB record pointing at that container, silently turning a
 * transient Docker failure into a container that's orphaned (running, but matching no session row
 * at all) until the next backend-boot `reconcileOrphans` pass finds it by label instead of by
 * session. Aborting the whole deletion on teardown failure means the account, session, and
 * container all stay consistent with each other, and the caller gets a real error to retry.
 */
export async function deleteOwnAccount(userId: string, currentPassword: string): Promise<void> {
  const result = await pool.query<UserRow>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("user not found");

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) throw new Error("current password is incorrect");

  const activeSession = await getActiveSessionForUser(userId);
  if (activeSession) {
    await stopSession(activeSession.id, userId, "abandoned");
  }

  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}
