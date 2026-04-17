import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RoleMode = "viewer" | "editor" | "admin" | "unauth" | "superuser";

async function ensureSitesSchema(): Promise<void> {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;

  const { Pool } = pg;
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    const migrationPath = path.join(__dirname, "../../migrations/add-sites.sql");
    const sqlText = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sqlText);
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'exec-sum-user', 'test-hash', 'admin', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    await pool.end();
  }
}

async function startServer(
  role: RoleMode,
  opts?: { siteScoping?: boolean },
): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, _res, next) => {
    if (role === "unauth") {
      (req as any).isAuthenticated = () => false;
      (req as any).user = undefined;
      return next();
    }
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: 1, username: "exec-sum-user", role };
    return next();
  });

  const httpServer = createServer(app);

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.SITE_SCOPING_ENABLED = opts?.siteScoping === true ? "true" : "false";

  await ensureSitesSchema();
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

test("executive summary: unauthenticated 401", async () => {
  const { baseUrl, httpServer } = await startServer("unauth");
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("executive summary: invalid siteId returns 400 when site scoping enabled", async () => {
  const { baseUrl, httpServer } = await startServer("viewer", { siteScoping: true });
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary?siteId=bad`, { credentials: "include" });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { code: string; message: string };
    assert.equal(data.code, "invalid_site_id");
    assert.match(data.message, /siteId/i);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("executive summary: viewer receives asset + compliance; reliability null", async () => {
  const { baseUrl, httpServer } = await startServer("viewer");
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      schemaVersion: number;
      assetHealth: { totalItems: number };
      compliance: { counts: Record<string, number> };
      reliability: unknown;
    };
    assert.equal(data.schemaVersion, 1);
    assert.ok(typeof data.assetHealth.totalItems === "number");
    assert.ok(data.compliance.counts);
    assert.equal(data.reliability, null);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("executive summary: editor receives reliability object", async () => {
  const { baseUrl, httpServer } = await startServer("editor");
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      reliability: { kpis: { backupSuccessRate7d: number | null } } | null;
    };
    assert.ok(data.reliability);
    assert.ok(data.reliability!.kpis);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("executive summary: unexpected role string does not receive ops block", async () => {
  const { baseUrl, httpServer } = await startServer("superuser");
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { reliability: unknown };
    assert.equal(data.reliability, null);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("executive summary PDF returns application/pdf", async () => {
  const { baseUrl, httpServer } = await startServer("viewer");
  try {
    const res = await fetch(`${baseUrl}/api/reports/executive-summary/pdf`, { credentials: "include" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    assert.ok(buf.length > 100, "expected non-trivial PDF body");
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("inventory template: invalid preset 400", async () => {
  const { baseUrl, httpServer } = await startServer("admin");
  try {
    const res = await fetch(`${baseUrl}/api/inventory/export/template?preset=nope`, { credentials: "include" });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});

test("inventory template: field preset CSV contains FLD row", async () => {
  const { baseUrl, httpServer } = await startServer("admin");
  try {
    const res = await fetch(`${baseUrl}/api/inventory/export/template?preset=field`, { credentials: "include" });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("FLD-001"));
    assert.ok(text.includes("code,name,serial_number"));
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
  }
});
