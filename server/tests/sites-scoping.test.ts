import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'test-user', 'test-hash', 'admin', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    await pool.end();
  }
}

async function startScopedServer(): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: 1, username: "test-user", role: "admin" };
    return next();
  });

  const httpServer = createServer(app);

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.SITE_SCOPING_ENABLED = "true";

  await ensureSitesSchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

test("site scoping: list filters by siteId when SITE_SCOPING_ENABLED", async (t) => {
  const { baseUrl, httpServer } = await startScopedServer();
  t.after(() => new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve()))));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  t.after(() => pool.end());

  const sitesRes = await fetch(`${baseUrl}/api/sites`, { credentials: "include" });
  assert.equal(sitesRes.status, 200);
  const sitesJson = (await sitesRes.json()) as { sites: { id: number; slug: string | null }[] };
  const defaultSite = sitesJson.sites.find((s) => s.slug === "default");
  assert.ok(defaultSite, "default site exists");

  const ins = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["Scope Test Beta", "test-scope-beta"],
  );
  const betaId = ins.rows[0]!.id;
  assert.ok(betaId !== defaultSite.id);

  const code = `SITESCOPETEST-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/inventory`, {
    method: "POST",
    headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      code,
      name: "Scoped row",
      units: 1,
      category: "Other",
      siteId: betaId,
    }),
  });
  assert.equal(createRes.status, 201, await createRes.text());

  const listBeta = await fetch(`${baseUrl}/api/inventory?siteId=${betaId}&search=${encodeURIComponent(code)}`, {
    credentials: "include",
  });
  assert.equal(listBeta.status, 200);
  const betaData = (await listBeta.json()) as { items: { code: string }[]; total: number };
  assert.ok(betaData.items.some((i) => i.code === code));

  const listDefault = await fetch(`${baseUrl}/api/inventory?siteId=${defaultSite.id}&search=${encodeURIComponent(code)}`, {
    credentials: "include",
  });
  assert.equal(listDefault.status, 200);
  const defaultData = (await listDefault.json()) as { items: { code: string }[]; total: number };
  assert.equal(defaultData.items.filter((i) => i.code === code).length, 0);

  await pool.query(`DELETE FROM inventory_items WHERE code = $1`, [code]);
});

test("site scoping: malformed siteId returns 400 with invalid_site_id", async (t) => {
  const { baseUrl, httpServer } = await startScopedServer();
  t.after(() => new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve()))));

  const bad = await fetch(`${baseUrl}/api/inventory?siteId=not-a-number`, { credentials: "include" });
  assert.equal(bad.status, 400);
  const body = (await bad.json()) as { message: string; code: string };
  assert.equal(body.code, "invalid_site_id");
  assert.match(body.message, /siteId/i);
});
