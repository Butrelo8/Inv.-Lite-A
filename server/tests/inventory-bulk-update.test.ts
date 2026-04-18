import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function skipIfPostgresDown(t: { skip: (m?: string) => void }, pool: pg.Pool): Promise<boolean> {
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

async function ensureBulkTestUser(): Promise<void> {
  const url =
    process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;

  const { Pool } = pg;
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'test-user', 'test-hash', 'admin', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    await pool.end();
  }
}

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, _res, next) => {
    if (roleMode.auth === "unauth") {
      (req as { isAuthenticated?: () => boolean }).isAuthenticated = () => false;
      (req as { user?: unknown }).user = undefined;
      return next();
    }
    const role = roleMode.auth;
    (req as { isAuthenticated?: () => boolean }).isAuthenticated = () => true;
    (req as { user?: { id: number; username: string; role: string } }).user = {
      id: 1,
      username: "test-user",
      role,
    };
    return next();
  });

  const httpServer = createServer(app);

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  await ensureBulkTestUser();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as { port: number }).port;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

test("bulk update: batches update + history in one transaction", async (t) => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  if (await skipIfPostgresDown(t, pool)) {
    await pool.end();
    return;
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ids: number[] = [];

  for (let i = 0; i < 10; i++) {
    const code = `BULK-UP-${suffix}-${i}`;
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO inventory_items (code, name, units, category, responsible, "condition")
       VALUES ($1, $2, $3, 'Cat', 'R1', 'Regular') RETURNING id`,
      [code, `Bulk parity ${i}`, i + 1],
    );
    ids.push(ins.rows[0]!.id);
  }

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/bulk/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({
        ids,
        updates: { condition: "Bueno" },
        reason: "test batch",
      }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { updated: number; missing: number[] };
    assert.equal(body.updated, 10);
    assert.deepEqual(body.missing, []);

    const conds = await pool.query<{ id: number; condition: string | null }>(
      `SELECT id, "condition" FROM inventory_items WHERE id = ANY($1::int[]) ORDER BY id`,
      [ids],
    );
    assert.equal(conds.rows.length, 10);
    for (const row of conds.rows) {
      assert.equal(row.condition, "Bueno");
    }

    const hist = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM inventory_history
       WHERE product_id = ANY($1::int[]) AND transaction_type = 'ADJUSTMENT'
         AND remarks LIKE 'BULK_UPDATE:%'`,
      [ids],
    );
    assert.equal(hist.rows[0]!.c, 10);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM inventory_history WHERE product_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM inventory_items WHERE id = ANY($1::int[])`, [ids]);
    await pool.end();
  }
});

test("bulk update: missing ids reported, partial update", async (t) => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  if (await skipIfPostgresDown(t, pool)) {
    await pool.end();
    return;
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible, "condition")
     VALUES ($1, 'Partial bulk', 1, 'C', 'R', 'A') RETURNING id`,
    [`BULK-PART-${suffix}`],
  );
  const goodId = ins.rows[0]!.id;
  const ghost1 = 2_147_000_011;
  const ghost2 = 2_147_000_012;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/bulk/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({
        ids: [goodId, ghost1, ghost2],
        updates: { condition: "Zeta" },
      }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { updated: number; missing: number[] };
    assert.equal(body.updated, 1);
    assert.ok(body.missing.includes(ghost1));
    assert.ok(body.missing.includes(ghost2));
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [goodId]);
    await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [goodId]);
    await pool.end();
  }
});

test("bulk update: explicit responsible null", async (t) => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  if (await skipIfPostgresDown(t, pool)) {
    await pool.end();
    return;
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible, "condition")
     VALUES ($1, 'Null resp bulk', 1, 'C', 'Was Here', 'Ok') RETURNING id`,
    [`BULK-NULL-${suffix}`],
  );
  const id = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/bulk/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({
        ids: [id],
        updates: { responsible: null },
      }),
    });
    assert.equal(resp.status, 200);
    const row = await pool.query<{ responsible: string | null }>(`SELECT responsible FROM inventory_items WHERE id = $1`, [id]);
    assert.equal(row.rows[0]!.responsible, null);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [id]);
    await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
    await pool.end();
  }
});

test("bulk update: viewer receives 403", async (t) => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const probe = new pg.Pool({ connectionString: url });
  if (await skipIfPostgresDown(t, probe)) {
    await probe.end();
    return;
  }
  await probe.end();

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/bulk/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ ids: [1], updates: { condition: "X" } }),
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }
});

test("bulk archive: batches condition + history", async (t) => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  if (await skipIfPostgresDown(t, pool)) {
    await pool.end();
    return;
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO inventory_items (code, name, units, category, responsible, "condition")
       VALUES ($1, $2, 1, 'C', 'R', 'Live') RETURNING id`,
      [`BULK-ARC-${suffix}-${i}`, `Archive me ${i}`],
    );
    ids.push(ins.rows[0]!.id);
  }

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/bulk/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ ids, reason: "cleanup" }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { archived: number; missing: unknown[] };
    assert.equal(body.archived, 3);

    const rows = await pool.query<{ condition: string | null }>(
      `SELECT "condition" FROM inventory_items WHERE id = ANY($1::int[])`,
      [ids],
    );
    for (const r of rows.rows) assert.equal(r.condition, "Archived");

    const hist = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM inventory_history
       WHERE product_id = ANY($1::int[]) AND remarks LIKE 'BULK_ARCHIVE:%'`,
      [ids],
    );
    assert.equal(hist.rows[0]!.c, 3);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM inventory_history WHERE product_id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM inventory_items WHERE id = ANY($1::int[])`, [ids]);
    await pool.end();
  }
});
