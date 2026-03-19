import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

import { ensureThumbsDir } from "../thumbnails";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function ensureSharedNotesSchema() {
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
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'test-user', 'test-hash', 'viewer', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`TRUNCATE TABLE shared_notes RESTART IDENTITY;`);
  } finally {
    await pool.end();
  }
}

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer }> {
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

  await ensureSharedNotesSchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  ensureThumbsDir();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  assert(addr && typeof addr === "object", "Expected server address");
  const port = (addr as any).port as number;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
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
  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/shared-notes`, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ title: "t1", content: "c1" }),
    });
    assert.equal(resp.status, 201);
  } finally {
    httpServer.close();
  }
});

