import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FALLBACK_DB = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";

/** Same DB the app uses (`server/db.ts`); only default when unset so we never split fixtures vs Drizzle across two URLs. */
function resolvePgConnectionString(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    process.env.DATABASE_URL = FALLBACK_DB;
    return FALLBACK_DB;
  }
  return raw;
}

function testPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 15_000,
    max: 5,
  });
}

async function ensureRbacSchema(): Promise<void> {
  const url = resolvePgConnectionString();

  const { Pool } = pg;
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15_000, max: 5 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    const sitesSql = fs.readFileSync(path.join(__dirname, "../../migrations/add-sites.sql"), "utf8");
    await pool.query(sitesSql);
    const rbacSql = fs.readFileSync(path.join(__dirname, "../../migrations/add-site-rbac.sql"), "utf8");
    await pool.query(rbacSql);
  } finally {
    await pool.end();
  }
}

async function startServerAsUser(user: { id: number; username: string; role: string }): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, _res, next) => {
    type MockRequest = Omit<express.Request, "isAuthenticated"> & {
      isAuthenticated: () => boolean;
      user: typeof user;
    };
    const r = req as unknown as MockRequest;
    r.isAuthenticated = () => true;
    r.user = user;
    return next();
  });

  const httpServer = createServer(app);

  resolvePgConnectionString();
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.SITE_SCOPING_ENABLED = "true";
  process.env.SITE_RBAC_ENABLED = "true";

  await ensureRbacSchema();
  const { registerRoutes } = await import("../routes");
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, httpServer };
}

const fetchOpts = { credentials: "include" as const, headers: { "Sec-Fetch-Site": "same-origin" } };

test("site RBAC: editor with site_viewer grant cannot read item in other site", async (t) => {
  const pool = testPool(resolvePgConnectionString());

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uA = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'editor') RETURNING id`,
    [`rbac-a-${suffix}`],
  );
  const userAId = uA.rows[0]!.id;

  const slugA = `rbac-site-a-${suffix}`;
  const slugB = `rbac-site-b-${suffix}`;
  const insA = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["RBAC Site A", slugA],
  );
  const insB = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["RBAC Site B", slugB],
  );
  const siteAId = insA.rows[0]!.id;
  const siteBId = insB.rows[0]!.id;

  await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userAId]);
  await pool.query(
    `INSERT INTO user_site_roles (user_id, site_id, template_id) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, site_id) DO UPDATE SET template_id = EXCLUDED.template_id`,
    [userAId, siteAId],
  );

  const codeA = `RBAC-A-${suffix}`;
  const codeB = `RBAC-B-${suffix}`;
  const itemA = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, site_id) VALUES ($1, 'Item A', 1, $2) RETURNING id`,
    [codeA, siteAId],
  );
  const itemB = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, site_id) VALUES ($1, 'Item B', 1, $2) RETURNING id`,
    [codeB, siteBId],
  );
  const idA = itemA.rows[0]!.id;
  const idB = itemB.rows[0]!.id;

  const { baseUrl, httpServer } = await startServerAsUser({
    id: userAId,
    username: `rbac-a-${suffix}`,
    role: "editor",
  });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((e) => (e ? reject(e) : resolve()));
    });
    await pool.query(`DELETE FROM inventory_items WHERE id IN ($1, $2)`, [idA, idB]);
    await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [siteAId, siteBId]);
    await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userAId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
    await pool.end();
  });

  const ok = await fetch(`${baseUrl}/api/inventory/${idA}`, fetchOpts);
  const okBody = await ok.text();
  if (ok.status !== 200) {
    throw new Error(`same-site GET expected 200, got ${ok.status}: ${okBody}`);
  }

  const denied = await fetch(`${baseUrl}/api/inventory/${idB}`, fetchOpts);
  const deniedBody = await denied.text();
  if (denied.status !== 403) {
    throw new Error(`cross-site GET expected 403, got ${denied.status}: ${deniedBody}`);
  }
});

test("site RBAC: admin bypasses grants and reads any site item", async (t) => {
  const pool = testPool(resolvePgConnectionString());

  const adm = await pool.query<{ id: number; username: string }>(
    `SELECT id, username FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`,
  );
  let adminId: number;
  let username: string;
  let deleteAdminAfter = false;
  if (adm.rows.length === 0) {
    const suffix = `${Date.now()}`;
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'admin') RETURNING id`,
      [`rbac-admin-${suffix}`],
    );
    adminId = ins.rows[0]!.id;
    username = `rbac-admin-${suffix}`;
    deleteAdminAfter = true;
  } else {
    adminId = adm.rows[0]!.id;
    username = adm.rows[0]!.username;
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `rbac-admin-site-${suffix}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["RBAC Admin Site", slug],
  );
  const siteId = ins.rows[0]!.id;
  const code = `RBAC-ADM-${suffix}`;
  const item = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, site_id) VALUES ($1, 'Admin item', 1, $2) RETURNING id`,
    [code, siteId],
  );
  const itemId = item.rows[0]!.id;

  const { baseUrl, httpServer } = await startServerAsUser({ id: adminId, username, role: "admin" });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((e) => (e ? reject(e) : resolve()));
    });
    await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
    await pool.query(`DELETE FROM sites WHERE id = $1`, [siteId]);
    if (deleteAdminAfter) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [adminId]);
    }
    await pool.end();
  });

  const res = await fetch(`${baseUrl}/api/inventory/${itemId}`, fetchOpts);
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(`admin GET expected 200, got ${res.status}: ${body}`);
  }
});

test("site RBAC: unknown-only template capabilities fall back to global editor caps", async (t) => {
  const pool = testPool(resolvePgConnectionString());
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uA = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'editor') RETURNING id`,
    [`rbac-badcaps-${suffix}`],
  );
  const userAId = uA.rows[0]!.id;

  const slugA = `rbac-badcaps-a-${suffix}`;
  const slugB = `rbac-badcaps-b-${suffix}`;
  const insA = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["BC A", slugA],
  );
  const insB = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["BC B", slugB],
  );
  const siteAId = insA.rows[0]!.id;
  const siteBId = insB.rows[0]!.id;

  const tpl = await pool.query<{ id: number }>(
    `INSERT INTO role_templates (key, display_name, capabilities) VALUES ($1, 'Bad', '["__nope__"]'::jsonb) RETURNING id`,
    [`bad-tpl-${suffix}`],
  );
  const badTplId = tpl.rows[0]!.id;

  await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userAId]);
  await pool.query(
    `INSERT INTO user_site_roles (user_id, site_id, template_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, site_id) DO UPDATE SET template_id = EXCLUDED.template_id`,
    [userAId, siteAId, badTplId],
  );

  const codeA = `BC-A-${suffix}`;
  const codeB = `BC-B-${suffix}`;
  const itemA = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, site_id) VALUES ($1, 'Item', 1, $2) RETURNING id`,
    [codeA, siteAId],
  );
  const itemB = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, site_id) VALUES ($1, 'Item', 1, $2) RETURNING id`,
    [codeB, siteBId],
  );
  const idA = itemA.rows[0]!.id;
  const idB = itemB.rows[0]!.id;

  const { baseUrl, httpServer } = await startServerAsUser({
    id: userAId,
    username: `rbac-badcaps-${suffix}`,
    role: "editor",
  });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((e) => (e ? reject(e) : resolve()));
    });
    await pool.query(`DELETE FROM inventory_items WHERE id IN ($1, $2)`, [idA, idB]);
    await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userAId]);
    await pool.query(`DELETE FROM role_templates WHERE id = $1`, [badTplId]);
    await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [siteAId, siteBId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
    await pool.end();
  });

  const same = await fetch(`${baseUrl}/api/inventory/${idA}`, fetchOpts);
  if (same.status !== 200) {
    throw new Error(`expected 200 on granted site with invalid template caps, got ${same.status}: ${await same.text()}`);
  }
  const cross = await fetch(`${baseUrl}/api/inventory/${idB}`, fetchOpts);
  if (cross.status !== 403) {
    throw new Error(`expected 403 on non-granted site, got ${cross.status}: ${await cross.text()}`);
  }
});

test("site RBAC: empty template capabilities log non-production warn before global cap merge", async (t) => {
  const pool = testPool(resolvePgConnectionString());
  await ensureRbacSchema();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const u = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'editor') RETURNING id`,
    [`rbac-empty-tpl-${suffix}`],
  );
  const userId = u.rows[0]!.id;

  const slug = `rbac-empty-tpl-${suffix}`;
  const insSite = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["EmptyTpl Site", slug],
  );
  const siteId = insSite.rows[0]!.id;

  const tpl = await pool.query<{ id: number }>(
    `INSERT INTO role_templates (key, display_name, capabilities) VALUES ($1, 'Empty caps', '[]'::jsonb) RETURNING id`,
    [`empty-tpl-${suffix}`],
  );
  const tplId = tpl.rows[0]!.id;

  await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userId]);
  await pool.query(
    `INSERT INTO user_site_roles (user_id, site_id, template_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, site_id) DO UPDATE SET template_id = EXCLUDED.template_id`,
    [userId, siteId, tplId],
  );

  const prevScoping = process.env.SITE_SCOPING_ENABLED;
  const prevRbac = process.env.SITE_RBAC_ENABLED;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.SITE_SCOPING_ENABLED = "true";
  process.env.SITE_RBAC_ENABLED = "true";
  process.env.NODE_ENV = "test";

  const warnCalls: unknown[][] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  t.after(async () => {
    console.warn = origWarn;
    process.env.SITE_SCOPING_ENABLED = prevScoping;
    process.env.SITE_RBAC_ENABLED = prevRbac;
    process.env.NODE_ENV = prevNodeEnv;
    await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM role_templates WHERE id = $1`, [tplId]);
    await pool.query(`DELETE FROM sites WHERE id = $1`, [siteId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });

  const { loadSiteAccess } = await import("../site-rbac-access");
  const access = await loadSiteAccess(userId, "editor");

  assert.ok(warnCalls.length >= 1, "expected console.warn when grants exist but template caps are empty");
  const first = warnCalls[0]!;
  assert.match(String(first[0]), /\[site-rbac\]/);
  const detail = first[1] as {
    userId: number;
    unknownSamples: string[];
    hadAnyRawCapabilityStrings: boolean;
  };
  assert.equal(detail.userId, userId);
  assert.equal(detail.hadAnyRawCapabilityStrings, false);
  assert.deepEqual(detail.unknownSamples, []);

  assert.equal(access.hasExplicitSiteGrants, true);
  assert.ok(access.capabilities.has("inventory:write"), "falls back to editor global caps");
  assert.deepEqual(access.restrictToSiteIds, [siteId]);
});
