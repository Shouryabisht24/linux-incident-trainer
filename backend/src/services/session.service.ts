import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";
import { pool } from "../db/pool.js";
import { getChallengeBySlug } from "./challenge.service.js";
import {
  buildImageIfMissing,
  createSessionContainer,
  destroyContainer,
  ensureChallengeNetwork,
  runCheck,
} from "./docker.service.js";

const JWT_SECRET = process.env.JWT_SECRET!;
const MAX_CONCURRENT_SESSIONS = Number(process.env.MAX_CONCURRENT_SESSIONS ?? 3);
const ACTIVE_STATUSES = ["starting", "running", "checking"] as const;

export interface Session {
  id: string;
  user_id: string;
  challenge_id: string;
  container_id: string | null;
  container_name: string | null;
  status: string;
  hints_used: number;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  solved_at: string | null;
}

async function getOwnedSession(sessionId: string, userId: string): Promise<Session> {
  const result = await pool.query<Session>("SELECT * FROM sessions WHERE id = $1 AND user_id = $2", [
    sessionId,
    userId,
  ]);
  const session = result.rows[0];
  if (!session) throw new Error("session not found");
  return session;
}

export async function startSession(
  userId: string,
  challengeSlug: string,
): Promise<{ sessionId: string; wsTicket: string; expiresInSeconds: number }> {
  const challenge = await getChallengeBySlug(challengeSlug);
  if (!challenge || !challenge.is_active) throw new Error("challenge not found");

  const activeCount = await pool.query(
    `SELECT count(*)::int AS n FROM sessions WHERE status = ANY($1)`,
    [ACTIVE_STATUSES],
  );
  if (activeCount.rows[0].n >= MAX_CONCURRENT_SESSIONS) {
    const err = new Error("too many concurrent sessions") as Error & { statusCode?: number };
    err.statusCode = 429;
    throw err;
  }

  const priorSession = await pool.query<Session>(
    `SELECT * FROM sessions WHERE user_id = $1 AND status = ANY($2) LIMIT 1`,
    [userId, ACTIVE_STATUSES],
  );
  if (priorSession.rows[0]) {
    await stopSession(priorSession.rows[0].id, userId, "abandoned");
  }

  const inserted = await pool.query<Session>(
    `INSERT INTO sessions (user_id, challenge_id, status) VALUES ($1, $2, 'starting') RETURNING *`,
    [userId, challenge.id],
  );
  const session = inserted.rows[0];

  try {
    if (challenge.requires_network) await ensureChallengeNetwork();
    const tag = await buildImageIfMissing(challenge);
    const container = await createSessionContainer(session.id, challenge, tag);

    await pool.query(`UPDATE sessions SET container_id = $1, container_name = $2, status = 'running' WHERE id = $3`, [
      container.id,
      container.name,
      session.id,
    ]);
  } catch (err) {
    await pool.query(`UPDATE sessions SET status = 'error', ended_at = now() WHERE id = $1`, [session.id]);
    throw err;
  }

  return { sessionId: session.id, wsTicket: issueWsTicket(session.id, userId), expiresInSeconds: 60 };
}

export async function stopSession(sessionId: string, userId: string, finalStatus: string = "abandoned"): Promise<void> {
  const session = await getOwnedSession(sessionId, userId);
  if (session.container_id) {
    await destroyContainer(session.container_id);
  }
  await pool.query(`UPDATE sessions SET status = $1, ended_at = now() WHERE id = $2`, [finalStatus, sessionId]);
}

export async function heartbeat(sessionId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE sessions SET last_activity_at = now() WHERE id = $1 AND user_id = $2 AND status = ANY($3)`,
    [sessionId, userId, ACTIVE_STATUSES],
  );
}

export async function checkSession(
  sessionId: string,
  userId: string,
): Promise<{ passed: boolean; output: string }> {
  const session = await getOwnedSession(sessionId, userId);
  if (!session.container_id) throw new Error("session has no running container");

  await pool.query(`UPDATE sessions SET status = 'checking' WHERE id = $1`, [sessionId]);
  const result = await runCheck(session.container_id);

  await pool.query(
    `INSERT INTO check_attempts (session_id, passed, output) VALUES ($1, $2, $3)`,
    [sessionId, result.passed, result.output],
  );

  if (result.passed) {
    await pool.query(`UPDATE sessions SET status = 'solved', solved_at = now() WHERE id = $1`, [sessionId]);
    await upsertProgress(userId, session.challenge_id, true, session.hints_used);
  } else {
    await pool.query(`UPDATE sessions SET status = 'running' WHERE id = $1`, [sessionId]);
    await upsertProgress(userId, session.challenge_id, false, session.hints_used);
  }

  return result;
}

async function upsertProgress(userId: string, challengeId: string, solved: boolean, hintsUsed: number): Promise<void> {
  await pool.query(
    `INSERT INTO progress (user_id, challenge_id, best_status, attempts_count, hints_used_max, first_solved_at, last_attempted_at)
     VALUES ($1, $2, $3, 1, $4, CASE WHEN $5 THEN now() ELSE NULL END, now())
     ON CONFLICT (user_id, challenge_id) DO UPDATE SET
       best_status = CASE WHEN progress.best_status = 'solved' THEN 'solved' ELSE EXCLUDED.best_status END,
       attempts_count = progress.attempts_count + 1,
       hints_used_max = GREATEST(progress.hints_used_max, EXCLUDED.hints_used_max),
       first_solved_at = COALESCE(progress.first_solved_at, EXCLUDED.first_solved_at),
       last_attempted_at = now()`,
    [userId, challengeId, solved ? "solved" : "unsolved", hintsUsed, solved],
  );
}

export async function getHintsState(
  sessionId: string,
  userId: string,
): Promise<{ revealed: string[]; totalHints: number }> {
  const session = await getOwnedSession(sessionId, userId);
  const hints = await pool.query<{ text: string }>(
    `SELECT text FROM hints WHERE challenge_id = $1 ORDER BY order_index LIMIT $2`,
    [session.challenge_id, session.hints_used],
  );
  const totalResult = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM hints WHERE challenge_id = $1`,
    [session.challenge_id],
  );
  return { revealed: hints.rows.map((r) => r.text), totalHints: totalResult.rows[0].n };
}

export async function revealNextHint(
  sessionId: string,
  userId: string,
): Promise<{ hint: string | null; hintsUsed: number; totalHints: number }> {
  const session = await getOwnedSession(sessionId, userId);
  const nextIndex = session.hints_used + 1;

  const hintResult = await pool.query<{ text: string }>(
    `SELECT text FROM hints WHERE challenge_id = $1 AND order_index = $2`,
    [session.challenge_id, nextIndex],
  );
  const totalResult = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM hints WHERE challenge_id = $1`,
    [session.challenge_id],
  );
  const totalHints = totalResult.rows[0].n;

  const hint = hintResult.rows[0];
  if (!hint) return { hint: null, hintsUsed: session.hints_used, totalHints };

  await pool.query(`UPDATE sessions SET hints_used = $1 WHERE id = $2`, [nextIndex, sessionId]);
  return { hint: hint.text, hintsUsed: nextIndex, totalHints };
}

export async function getSolution(sessionId: string, userId: string): Promise<string> {
  const session = await getOwnedSession(sessionId, userId);
  const result = await pool.query<{ solution_md: string }>("SELECT solution_md FROM challenges WHERE id = $1", [
    session.challenge_id,
  ]);
  return result.rows[0].solution_md;
}

export async function getSessionForUser(sessionId: string, userId: string): Promise<Session> {
  return getOwnedSession(sessionId, userId);
}

export interface ActiveSession extends Session {
  challenge_slug: string;
  challenge_title: string;
}

/**
 * Returns the current user's single active (starting/running/checking) session, if any,
 * joined with its challenge slug/title so the frontend can resume straight into the right
 * challenge page after a refresh without a second round trip. Added for Phase 3's
 * resume-on-refresh requirement — decisions/0008-*.md.
 */
export async function getActiveSessionForUser(userId: string): Promise<ActiveSession | null> {
  const result = await pool.query<ActiveSession>(
    `SELECT s.*, c.slug AS challenge_slug, c.title AS challenge_title
     FROM sessions s
     JOIN challenges c ON c.id = s.challenge_id
     WHERE s.user_id = $1 AND s.status = ANY($2)
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [userId, ACTIVE_STATUSES],
  );
  return result.rows[0] ?? null;
}

export function issueWsTicket(sessionId: string, userId: string): string {
  return jwt.sign({ sessionId, sub: userId, type: "ws-ticket" }, JWT_SECRET, { expiresIn: "60s" });
}

export function verifyWsTicket(ticket: string): { sessionId: string; userId: string } {
  const payload = jwt.verify(ticket, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== "ws-ticket" || typeof payload.sessionId !== "string" || typeof payload.sub !== "string") {
    throw new Error("invalid ticket");
  }
  return { sessionId: payload.sessionId, userId: payload.sub };
}

export async function reapIdleSessions(): Promise<void> {
  const idleTimeoutMinutes = Number(process.env.IDLE_TIMEOUT_MINUTES ?? 20);
  const solvedGraceMinutes = Number(process.env.SOLVED_GRACE_MINUTES ?? 5);

  const idle = await pool.query<Session>(
    `SELECT * FROM sessions WHERE status = ANY($1) AND last_activity_at < now() - ($2 || ' minutes')::interval`,
    [ACTIVE_STATUSES, idleTimeoutMinutes],
  );
  for (const session of idle.rows) {
    logger.info("reaping idle session", { sessionId: session.id });
    if (session.container_id) await destroyContainer(session.container_id).catch(() => {});
    await pool.query(`UPDATE sessions SET status = 'expired', ended_at = now() WHERE id = $1`, [session.id]);
  }

  const solved = await pool.query<Session>(
    `SELECT * FROM sessions WHERE status = 'solved' AND container_id IS NOT NULL
     AND solved_at < now() - ($1 || ' minutes')::interval`,
    [solvedGraceMinutes],
  );
  for (const session of solved.rows) {
    logger.info("reaping solved-session container", { sessionId: session.id });
    await destroyContainer(session.container_id!).catch(() => {});
    await pool.query(`UPDATE sessions SET container_id = NULL, ended_at = now() WHERE id = $1`, [session.id]);
  }
}

/**
 * Graceful-shutdown drain: destroy the challenge container for every active
 * session and mark the session abandoned, so a normal `docker compose down`
 * (SIGTERM) doesn't leave orphaned challenge containers behind. Best-effort —
 * container-removal errors are swallowed so one failure can't block the rest.
 */
export async function drainAllActiveSessions(): Promise<number> {
  const active = await pool.query<Session>(
    `SELECT * FROM sessions WHERE status = ANY($1) AND container_id IS NOT NULL`,
    [ACTIVE_STATUSES],
  );
  for (const session of active.rows) {
    await destroyContainer(session.container_id!).catch(() => {});
    await pool.query(`UPDATE sessions SET status = 'abandoned', ended_at = now() WHERE id = $1`, [session.id]);
  }
  return active.rows.length;
}

export async function listActiveContainerIds(): Promise<Set<string>> {
  const result = await pool.query<{ container_id: string }>(
    `SELECT container_id FROM sessions WHERE status = ANY($1) AND container_id IS NOT NULL`,
    [ACTIVE_STATUSES],
  );
  return new Set(result.rows.map((r) => r.container_id));
}

export async function markOrphanedSessionsError(liveContainerIds: Set<string>): Promise<void> {
  const active = await pool.query<Session>(`SELECT * FROM sessions WHERE status = ANY($1)`, [ACTIVE_STATUSES]);
  for (const session of active.rows) {
    if (session.container_id && !liveContainerIds.has(session.container_id)) {
      await pool.query(`UPDATE sessions SET status = 'error', ended_at = now() WHERE id = $1`, [session.id]);
    }
  }
}
