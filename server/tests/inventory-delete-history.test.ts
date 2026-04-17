import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function ensureDeleteHistorySchema(): Promise<void> {
  const url =
    process.env.DATABASE_URL ||
    "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
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
    if (roleMode.auth === "unauth") {
      (req as any).isAuthenticated = () => false;
      (req as any).user = undefined;
      return next();
    }
    const role = roleMode.auth;
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: 1, username: "test-user", role };
    return next();
  });

  const httpServer = createServer(app);

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  await ensureDeleteHistorySchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

test("inventory delete: writes DELETE history before item deletion", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `DEL-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const itemResult = await pool.query<{
    id: number;
    name: string;
  }>(
    `
      INSERT INTO inventory_items (code, name, units, category)
      VALUES ($1, 'Delete History Test Item', 3, 'Test')
      RETURNING id, name
    `,
    [code],
  );
  const itemId = itemResult.rows[0]?.id;
  assert.equal(typeof itemId, "number");

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/${itemId}`, {
      method: "DELETE",
      headers: {
        "Sec-Fetch-Site": "same-origin",
      },
    });
    assert.equal(resp.status, 200);
  } finally {
    httpServer.close();
  }

  const history = await pool.query<{
    transaction_type: string;
    remarks: string | null;
  }>(
    `
      SELECT transaction_type, remarks
      FROM inventory_history
      WHERE remarks = 'Delete History Test Item' AND transaction_type = 'DELETE'
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  await pool.end();

  assert.equal(history.rowCount, 1, "Expected DELETE history row to be written");
  assert.equal(history.rows[0]?.transaction_type, "DELETE");
});
