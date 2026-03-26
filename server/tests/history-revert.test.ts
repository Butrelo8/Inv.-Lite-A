import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "viewer" | "editor" | "admin" };

async function ensureRevertSchema(): Promise<void> {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;
  const pool = new pg.Pool({ connectionString: url });
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
      CREATE TABLE IF NOT EXISTS inventory_bulk_undo (
        id serial PRIMARY KEY,
        token text NOT NULL UNIQUE,
        action_type text NOT NULL,
        payload jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
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
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: 1, username: "test-user", role: roleMode.auth };
    return next();
  });

  const httpServer = createServer(app);
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  await ensureRevertSchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  return { baseUrl: `http://127.0.0.1:${(addr as any).port}`, httpServer };
}

test("history revert restores deleted item and consumes token", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `REV-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const itemResult = await pool.query<{ id: number }>(
    `insert into inventory_items (code, name, units, category) values ($1, 'Revert Test Item', 2, 'Test') returning id`,
    [code],
  );
  const itemId = itemResult.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  let historyId = 0;
  try {
    const del = await fetch(`${baseUrl}/api/inventory/${itemId}`, {
      method: "DELETE",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(del.status, 200);
    const historyRes = await pool.query<{ id: number }>(
      `select id from inventory_history where transaction_type='DELETE' and remarks like 'DELETE: Revert Test Item%[undo:%]' order by created_at desc limit 1`,
    );
    historyId = historyRes.rows[0]!.id;

    const revert = await fetch(`${baseUrl}/api/history/${historyId}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({}),
    });
    assert.equal(revert.status, 200);

    const revertAgain = await fetch(`${baseUrl}/api/history/${historyId}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({}),
    });
    assert.equal(revertAgain.status, 409);
  } finally {
    httpServer.close();
  }

  const exists = await pool.query(`select id from inventory_items where id = $1`, [itemId]);
  await pool.end();
  assert.equal(exists.rowCount, 1);
});

test("history revert returns expired when token is stale", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `EXP-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const itemResult = await pool.query<{ id: number }>(
    `insert into inventory_items (code, name, units, category) values ($1, 'Revert Expired Item', 1, 'Test') returning id`,
    [code],
  );
  const itemId = itemResult.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const del = await fetch(`${baseUrl}/api/inventory/${itemId}`, {
      method: "DELETE",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(del.status, 200);

    await pool.query(`
      update inventory_bulk_undo
      set expires_at = now() - interval '1 minute'
      where id = (
        select id
        from inventory_bulk_undo
        where action_type = 'single_delete'
        order by id desc
        limit 1
      )
    `);
    const historyRes = await pool.query<{ id: number }>(
      `select id from inventory_history where transaction_type='DELETE' and remarks like 'DELETE: Revert Expired Item%[undo:%]' order by created_at desc limit 1`,
    );
    const historyId = historyRes.rows[0]!.id;

    const revert = await fetch(`${baseUrl}/api/history/${historyId}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({}),
    });
    assert.equal(revert.status, 410);
  } finally {
    httpServer.close();
    await pool.end();
  }
});

test("history revert forbids viewer role", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/history/1/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({}),
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }
});
