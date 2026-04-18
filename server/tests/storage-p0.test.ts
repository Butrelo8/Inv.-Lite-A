import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_DB = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";

function resolvePg(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    process.env.DATABASE_URL = FALLBACK_DB;
    return FALLBACK_DB;
  }
  return raw;
}

async function ensureSitesAndRbac(pool: pg.Pool): Promise<void> {
  const sitesSql = fs.readFileSync(path.join(__dirname, "../../migrations/add-sites.sql"), "utf8");
  await pool.query(sitesSql);
  const rbacSql = fs.readFileSync(path.join(__dirname, "../../migrations/add-site-rbac.sql"), "utf8");
  await pool.query(rbacSql);
}

test("storage.updateItem throws 404 when row missing", async () => {
  resolvePg();
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  const { storage } = await import("../storage");
  await assert.rejects(
    storage.updateItem(2_147_000_001, { name: "ghost" }),
    (err: unknown) => {
      const e = err as Error & { status?: number };
      return e.status === 404 && e.message === "Item not found";
    },
  );
});

test("storage.upsertUserSiteRole rolls back delete when insert fails (FK)", async (t) => {
  const url = resolvePg();
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15_000, max: 3 });
  await ensureSitesAndRbac(pool);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userRes = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'admin') RETURNING id`,
    [`p0-upsert-${suffix}`],
  );
  const userId = userRes.rows[0]!.id;
  const siteRes = await pool.query<{ id: number }>(
    `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
    ["P0 Upsert Site", `p0-site-${suffix}`],
  );
  const siteId = siteRes.rows[0]!.id;
  const tidRes = await pool.query<{ id: number }>(`SELECT id FROM role_templates ORDER BY id LIMIT 1`);
  const templateId = tidRes.rows[0]!.id;

  await pool.query(
    `INSERT INTO user_site_roles (user_id, site_id, template_id) VALUES ($1, $2, $3)`,
    [userId, siteId, templateId],
  );

  const { storage } = await import("../storage");
  const badTemplateId = 9_999_999;

  await assert.rejects(storage.upsertUserSiteRole(userId, siteId, badTemplateId));

  const kept = await pool.query<{ template_id: number }>(
    `SELECT template_id FROM user_site_roles WHERE user_id = $1 AND site_id = $2`,
    [userId, siteId],
  );
  assert.equal(kept.rows.length, 1);
  assert.equal(kept.rows[0]!.template_id, templateId);

  t.after(async () => {
    await pool.query(`DELETE FROM user_site_roles WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM sites WHERE id = $1`, [siteId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });
});
