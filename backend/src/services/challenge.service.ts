import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/pool.js";

const FIXED_CATEGORIES = [
  { slug: "permissions-ownership", name: "Permissions & Ownership" },
  { slug: "disk-filesystem", name: "Disk & Filesystem" },
  { slug: "process-performance", name: "Process & Performance" },
  { slug: "networking-dns", name: "Networking & DNS" },
  { slug: "systemd-services", name: "systemd & Services" },
  { slug: "logs-journald", name: "Logs & journald" },
  { slug: "package-management", name: "Package Management" },
  { slug: "users-groups-sudo", name: "Users, Groups & sudo" },
  { slug: "cron-scheduling", name: "Cron & Scheduling" },
  { slug: "ssh-remote-access", name: "SSH & Remote Access" },
];

interface ChallengeJson {
  slug: string;
  title: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "hard";
  description_md: string;
  requires_network?: boolean;
  requires_systemd?: boolean;
  resource_limits?: { memoryMb?: number; cpus?: number; pidsLimit?: number };
  time_limit_minutes?: number;
  content_version: number;
}

interface HintJson {
  order_index: number;
  text: string;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  category_slug: string;
  category_name: string;
  difficulty: string;
  description_md: string;
  requires_network: boolean;
  requires_systemd: boolean;
  resource_limits: { memoryMb?: number; cpus?: number; pidsLimit?: number } | null;
  time_limit_minutes: number | null;
  content_version: number;
  solution_md: string;
  is_active: boolean;
}

export async function seedCategories(): Promise<void> {
  for (let i = 0; i < FIXED_CATEGORIES.length; i++) {
    const cat = FIXED_CATEGORIES[i];
    await pool.query(
      `INSERT INTO categories (slug, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [cat.slug, cat.name, i],
    );
  }
}

export async function syncChallengesFromDisk(challengesDir: string): Promise<void> {
  if (!fs.existsSync(challengesDir)) return;

  const entries = fs
    .readdirSync(challengesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"));

  for (const entry of entries) {
    const dir = path.join(challengesDir, entry.name);
    const challengeJsonPath = path.join(dir, "challenge.json");
    const solutionPath = path.join(dir, "solution.md");
    const hintsPath = path.join(dir, "hints.json");
    if (!fs.existsSync(challengeJsonPath) || !fs.existsSync(solutionPath)) continue;

    const challenge: ChallengeJson = JSON.parse(fs.readFileSync(challengeJsonPath, "utf8"));
    const solutionMd = fs.readFileSync(solutionPath, "utf8");
    const hints: HintJson[] = fs.existsSync(hintsPath) ? JSON.parse(fs.readFileSync(hintsPath, "utf8")) : [];

    const categoryResult = await pool.query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [
      challenge.category,
    ]);
    const categoryId = categoryResult.rows[0]?.id;
    if (!categoryId) {
      console.warn(`skipping challenge "${challenge.slug}": unknown category "${challenge.category}"`);
      continue;
    }

    const upserted = await pool.query<{ id: string }>(
      `INSERT INTO challenges (
         slug, title, category_id, difficulty, description_md,
         requires_network, requires_systemd, resource_limits,
         time_limit_minutes, content_version, solution_md
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         category_id = EXCLUDED.category_id,
         difficulty = EXCLUDED.difficulty,
         description_md = EXCLUDED.description_md,
         requires_network = EXCLUDED.requires_network,
         requires_systemd = EXCLUDED.requires_systemd,
         resource_limits = EXCLUDED.resource_limits,
         time_limit_minutes = EXCLUDED.time_limit_minutes,
         content_version = EXCLUDED.content_version,
         solution_md = EXCLUDED.solution_md,
         updated_at = now()
       RETURNING id`,
      [
        challenge.slug,
        challenge.title,
        categoryId,
        challenge.difficulty,
        challenge.description_md,
        challenge.requires_network ?? false,
        challenge.requires_systemd ?? false,
        challenge.resource_limits ? JSON.stringify(challenge.resource_limits) : null,
        challenge.time_limit_minutes ?? null,
        challenge.content_version,
        solutionMd,
      ],
    );
    const challengeId = upserted.rows[0].id;

    await pool.query("DELETE FROM hints WHERE challenge_id = $1", [challengeId]);
    for (const hint of hints) {
      await pool.query("INSERT INTO hints (challenge_id, order_index, text) VALUES ($1, $2, $3)", [
        challengeId,
        hint.order_index,
        hint.text,
      ]);
    }

    console.log(`synced challenge: ${challenge.slug} (${hints.length} hints)`);
  }
}

export async function listChallenges(userId: string): Promise<
  Array<Challenge & { solved: boolean }>
> {
  const result = await pool.query(
    `SELECT c.id, c.slug, c.title, cat.slug AS category_slug, cat.name AS category_name,
            c.difficulty, c.description_md, c.requires_network, c.requires_systemd,
            c.resource_limits, c.time_limit_minutes, c.content_version, c.solution_md, c.is_active,
            COALESCE(p.best_status = 'solved', false) AS solved
     FROM challenges c
     JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN progress p ON p.challenge_id = c.id AND p.user_id = $1
     WHERE c.is_active = true
     ORDER BY cat.sort_order, c.difficulty, c.title`,
    [userId],
  );
  return result.rows;
}

export async function getChallengeBySlug(slug: string): Promise<Challenge | null> {
  const result = await pool.query(
    `SELECT c.id, c.slug, c.title, cat.slug AS category_slug, cat.name AS category_name,
            c.difficulty, c.description_md, c.requires_network, c.requires_systemd,
            c.resource_limits, c.time_limit_minutes, c.content_version, c.solution_md, c.is_active
     FROM challenges c
     JOIN categories cat ON cat.id = c.category_id
     WHERE c.slug = $1`,
    [slug],
  );
  return result.rows[0] ?? null;
}
