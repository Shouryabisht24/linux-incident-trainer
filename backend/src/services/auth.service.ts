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

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, display_name: row.display_name, created_at: row.created_at };
}
