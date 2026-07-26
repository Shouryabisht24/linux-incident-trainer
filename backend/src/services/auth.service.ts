import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

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

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "auth" }, JWT_SECRET, { expiresIn: AUTH_TOKEN_EXPIRY });
}

export function verifyAuthToken(token: string): { userId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== "auth" || typeof payload.sub !== "string") {
    throw new Error("invalid token type");
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

  const passwordHash = await bcrypt.hash(password, 10);
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

  const valid = await bcrypt.compare(password, row.password_hash);
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
 * Changes a user's password. Requires the current password and verifies it via `bcrypt.compare`
 * against the stored hash first — there is no path to change a password without proving the
 * current one. Throws a generic "current password is incorrect" error on mismatch (never reveals
 * whether the account itself exists or anything about the stored hash).
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const result = await pool.query<UserRow>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("user not found");

  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) throw new Error("current password is incorrect");

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, userId]);
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
