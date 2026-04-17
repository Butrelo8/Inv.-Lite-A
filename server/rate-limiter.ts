import { pool } from "./db";

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_PER_IP_AND_USERNAME = 5;
const LOGIN_MAX_PER_IP = 20;

let setupPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

type ConsumeResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

async function ensureTable() {
  if (!setupPromise) {
    setupPromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS login_rate_limits (
          key TEXT PRIMARY KEY,
          window_start TIMESTAMPTZ NOT NULL,
          count INTEGER NOT NULL
        )
      `)
      .then(() => undefined);
  }
  await setupPromise;
}

async function upsertAndReadCount(key: string): Promise<{ count: number; ageMs: number }> {
  const result = await pool.query<{
    count: number;
    age_ms: string;
  }>(
    `
      INSERT INTO login_rate_limits (key, window_start, count)
      VALUES ($1, NOW(), 1)
      ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - login_rate_limits.window_start)) * 1000 > $2 THEN 1
          ELSE login_rate_limits.count + 1
        END,
        window_start = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - login_rate_limits.window_start)) * 1000 > $2 THEN NOW()
          ELSE login_rate_limits.window_start
        END
      RETURNING
        count,
        (EXTRACT(EPOCH FROM (NOW() - window_start)) * 1000)::BIGINT AS age_ms
    `,
    [key, LOGIN_WINDOW_MS],
  );
  const row = result.rows[0];
  return {
    count: Number(row?.count ?? 1),
    ageMs: Number(row?.age_ms ?? 0),
  };
}

function toRetryAfterSeconds(ageMs: number): number {
  const remaining = Math.max(0, LOGIN_WINDOW_MS - ageMs);
  return Math.max(1, Math.ceil(remaining / 1000));
}

async function maybeCleanupOldRows(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;
  await pool.query(
    `
      DELETE FROM login_rate_limits
      WHERE EXTRACT(EPOCH FROM (NOW() - window_start)) * 1000 > $1
    `,
    [LOGIN_WINDOW_MS],
  );
}

export async function consumeLoginRateLimit(ip: string, username: string): Promise<ConsumeResult> {
  await ensureTable();
  const safeIp = (ip || "unknown").trim();
  const safeUsername = (username || "").trim().toLowerCase() || "<empty>";
  const now = Date.now();

  const perIpUsername = await upsertAndReadCount(`login:ipu:${safeIp}:${safeUsername}`);
  if (perIpUsername.count > LOGIN_MAX_PER_IP_AND_USERNAME) {
    return { allowed: false, retryAfterSeconds: toRetryAfterSeconds(perIpUsername.ageMs) };
  }

  const perIp = await upsertAndReadCount(`login:ip:${safeIp}`);
  if (perIp.count > LOGIN_MAX_PER_IP) {
    return { allowed: false, retryAfterSeconds: toRetryAfterSeconds(perIp.ageMs) };
  }

  void maybeCleanupOldRows(now).catch(() => undefined);
  return { allowed: true };
}

export async function clearLoginRateLimitForUser(ip: string, username: string): Promise<void> {
  const safeIp = (ip || "unknown").trim();
  const safeUsername = (username || "").trim().toLowerCase() || "<empty>";
  await ensureTable();
  await pool.query("DELETE FROM login_rate_limits WHERE key = $1", [`login:ipu:${safeIp}:${safeUsername}`]);
}
