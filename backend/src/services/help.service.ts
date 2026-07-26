import { pool } from "../db/pool.js";

export interface HelpRequest {
  id: string;
  subject: string;
  message: string;
  created_at: string;
}

export async function submitHelpRequest(userId: string, subject: string, message: string): Promise<HelpRequest> {
  const result = await pool.query<HelpRequest>(
    `INSERT INTO help_requests (user_id, subject, message) VALUES ($1, $2, $3)
     RETURNING id, subject, message, created_at`,
    [userId, subject, message],
  );
  return result.rows[0];
}

export async function listHelpRequestsForUser(userId: string): Promise<HelpRequest[]> {
  const result = await pool.query<HelpRequest>(
    `SELECT id, subject, message, created_at FROM help_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}
