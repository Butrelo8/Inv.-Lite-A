import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { userSessions, loginRateLimits, opsEvents } from "@shared/schema";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://inventario:inventario@127.0.0.1/inventario";

async function skipIfPostgresDown(
  t: { skip: (m?: string) => void },
  pool: pg.Pool,
): Promise<boolean> {
  try {
    await pool.query("select 1");
    return false;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "ECONNREFUSED") {
      t.skip("Postgres not reachable (DATABASE_URL)");
      return true;
    }
    throw e;
  }
}

async function ensureUsersTableForOpsEventsFk(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function applyMigration(pool: pg.Pool) {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "migrations", "add-bootstrap-tables.sql"),
    "utf-8",
  );
  await pool.query(sql);
}

async function columnShape(pool: pg.Pool, table: string) {
  const r = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((c) => [c.column_name, c.data_type, c.is_nullable] as const);
}

async function indexNames(pool: pg.Pool, table: string) {
  const r = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [table],
  );
  return r.rows.map((x) => x.indexname);
}

async function primaryKeyColumns(pool: pg.Pool, table: string) {
  const r = await pool.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = $1::regclass AND c.contype = 'p'
     ORDER BY a.attnum`,
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

describe("bootstrap-tables migration parity", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  after(async () => {
    await pool.end();
  });

  test("user_sessions, login_rate_limits, ops_events match bootstrap SQL", async (t) => {
    if (await skipIfPostgresDown(t, pool)) return;
    await ensureUsersTableForOpsEventsFk(pool);
    await applyMigration(pool);

    assert.deepEqual(await columnShape(pool, "user_sessions"), [
      ["sid", "character varying", "NO"],
      ["sess", "json", "NO"],
      ["expire", "timestamp without time zone", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns(pool, "user_sessions"), ["sid"]);
    const sessionIdx = await indexNames(pool, "user_sessions");
    assert.ok(
      sessionIdx.some(
        (n) =>
          n === "IDX_user_sessions_expire" ||
          n.toLowerCase() === "idx_user_sessions_expire",
      ),
      `expected expire index, got: ${sessionIdx.join(", ")}`,
    );

    assert.deepEqual(await columnShape(pool, "login_rate_limits"), [
      ["key", "text", "NO"],
      ["window_start", "timestamp with time zone", "NO"],
      ["count", "integer", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns(pool, "login_rate_limits"), ["key"]);

    assert.deepEqual(await columnShape(pool, "ops_events"), [
      ["id", "integer", "NO"],
      ["event_type", "text", "NO"],
      ["severity", "text", "NO"],
      ["source", "text", "NO"],
      ["environment", "text", "NO"],
      ["payload", "jsonb", "YES"],
      ["user_id", "integer", "YES"],
      ["ip", "text", "YES"],
      ["request_id", "text", "YES"],
      ["endpoint", "text", "YES"],
      ["method", "text", "YES"],
      ["created_at", "timestamp with time zone", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns(pool, "ops_events"), ["id"]);
    const idx = await indexNames(pool, "ops_events");
    assert.ok(idx.includes("ops_events_event_type_created_at_idx"));
    assert.ok(idx.includes("ops_events_created_at_idx"));
    assert.ok(idx.includes("ops_events_severity_created_at_idx"));
  });
});

describe("bootstrap-tables drizzle exports", () => {
  test("userSessions exports with the expected column keys", () => {
    assert.ok("sid" in userSessions);
    assert.ok("sess" in userSessions);
    assert.ok("expire" in userSessions);
  });

  test("loginRateLimits exports with the expected column keys", () => {
    assert.ok("key" in loginRateLimits);
    assert.ok("windowStart" in loginRateLimits);
    assert.ok("count" in loginRateLimits);
  });

  test("opsEvents exports with the expected column keys", () => {
    for (const k of [
      "id",
      "eventType",
      "severity",
      "source",
      "environment",
      "payload",
      "userId",
      "ip",
      "requestId",
      "endpoint",
      "method",
      "createdAt",
    ]) {
      assert.ok(k in opsEvents, `missing column ${k}`);
    }
  });
});
