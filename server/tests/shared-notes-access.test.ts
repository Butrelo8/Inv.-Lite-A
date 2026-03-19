import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

import { ensureThumbsDir } from "../thumbnails";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function ensureSharedNotesSchema(): Promise<number> {
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
      CREATE TABLE IF NOT EXISTS shared_notes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        item_id INTEGER,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE shared_notes
        ADD COLUMN IF NOT EXISTS item_id INTEGER;
    `);

    // Ensure per-item linkage exists (important if the shared_notes table predates this feature).
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'shared_notes_item_id_fkey'
        ) THEN
          ALTER TABLE shared_notes
            ADD CONSTRAINT shared_notes_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'test-user', 'test-hash', 'viewer', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create a real inventory item so editor POST can reference a valid item_id.
    const code = `SN-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const itemResult = await pool.query(
      `
      INSERT INTO inventory_items (code, name, units, category)
      VALUES ($1, 'Shared Notes Test Item', 1, 'Other')
      RETURNING id;
    `,
      [code],
    );
    const itemId = itemResult.rows[0]?.id as number | undefined;
    assert.equal(typeof itemId, "number");

    await pool.query(`TRUNCATE TABLE shared_notes RESTART IDENTITY;`);
    return itemId;
  } finally {
    await pool.end();
  }
}

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer; itemId: number }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Simulate Passport's authenticated user for requireAuth/requireRole middleware.
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

  // `routes.ts` imports DB modules that require DATABASE_URL at import-time,
  // so we set safe test env before dynamically importing it.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  const itemId = await ensureSharedNotesSchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  ensureThumbsDir();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer, itemId };
}

const CSRF_HEADERS = {
  "Sec-Fetch-Site": "same-origin",
  "Content-Type": "application/json",
};

test("shared-notes: viewer GET returns 200", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/shared-notes`, { method: "GET" });
    assert.equal(resp.status, 200);
  } finally {
    httpServer.close();
  }
});

test("shared-notes: viewer POST returns 403", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/shared-notes`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "t1", content: "c1" }),
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }
});

test("shared-notes: editor POST returns 201", async () => {
  const { baseUrl, httpServer, itemId } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/shared-notes`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "t1", content: "c1", itemId }),
    });
    assert.equal(resp.status, 201);
  } finally {
    httpServer.close();
  }
});

