import { describe, test } from "node:test";
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
}

describe("inventory aggregates — SQL", () => {
  test("getResponsibleWithCounts, getFilterOptions, site + restrictToSiteIds", async (t) => {
    const url = resolvePg();
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = "test";
    process.env.SITE_SCOPING_ENABLED = "false";
    delete process.env.SITE_RBAC_ENABLED;

    const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15_000, max: 5 });
    await ensureSitesAndRbac(pool);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug1 = `agg-s1-${suffix}`;
    const slug2 = `agg-s2-${suffix}`;
    const s1 = await pool.query<{ id: number }>(
      `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
      ["Agg Site 1", slug1],
    );
    const s2 = await pool.query<{ id: number }>(
      `INSERT INTO sites (name, slug) VALUES ($1, $2) RETURNING id`,
      ["Agg Site 2", slug2],
    );
    const site1Id = s1.rows[0]!.id;
    const site2Id = s2.rows[0]!.id;

    const comp = await pool.query<{ id: number }>(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
      [`AggCo-${suffix}`],
    );
    const companyId = comp.rows[0]!.id;

    const rAmy = `AggAmy-${suffix}`;
    const rBob = `AggBob-${suffix}`;
    const rCarl = `AggCarl-${suffix}`;

    const { storage } = await import("../storage");
    const beforeCounts = await storage.getResponsibleWithCounts();
    const beforeMap = new Map(beforeCounts.map((r) => [r.name, r.count]));
    const optBefore = await storage.getFilterOptions();
    const catsBefore = new Set(optBefore.categories);

    const codes: string[] = [];
    const ins = async (code: string, siteId: number, category: string | null, responsible: string | null) => {
      codes.push(code);
      await pool.query(
        `INSERT INTO inventory_items (code, name, units, site_id, category, responsible, company_id)
         VALUES ($1, $2, 1, $3, $4, $5, $6)`,
        [code, `Item ${code}`, siteId, category, responsible, companyId],
      );
    };

    const cElec = `AggCatElec-${suffix}`;
    const cFurn = `AggCatFurn-${suffix}`;
    const cTool = `AggCatTool-${suffix}`;
    const cChem = `AggCatChem-${suffix}`;

    // 3 → Equipo, 2 → rBob, 2 → rAmy (tie-break name asc: rAmy < rBob)
    await ins(`agg-${suffix}-e1`, site1Id, cElec, null);
    await ins(`agg-${suffix}-e2`, site1Id, cElec, "   ");
    await ins(`agg-${suffix}-e3`, site1Id, cFurn, "");
    await ins(`agg-${suffix}-b1`, site1Id, cElec, rBob);
    await ins(`agg-${suffix}-b2`, site1Id, cFurn, rBob);
    await ins(`agg-${suffix}-a1`, site1Id, cTool, rAmy);
    await ins(`agg-${suffix}-a2`, site2Id, cTool, rAmy);
    await ins(`agg-${suffix}-c1`, site2Id, cChem, rCarl);

    const counts = await storage.getResponsibleWithCounts();
    const afterMap = new Map(counts.map((r) => [r.name, r.count]));
    const delta = (name: string) => (afterMap.get(name) ?? 0) - (beforeMap.get(name) ?? 0);
    assert.equal(delta("Equipo de trabajo"), 3);
    assert.equal(delta(rBob), 2);
    assert.equal(delta(rAmy), 2);
    assert.equal(delta(rCarl), 1);

    const idxAmy = counts.findIndex((r) => r.name === rAmy);
    const idxBob = counts.findIndex((r) => r.name === rBob);
    assert.ok(idxAmy >= 0 && idxBob >= 0);
    assert.equal(counts[idxAmy]!.count, counts[idxBob]!.count);
    assert.ok(idxAmy < idxBob, "same count → ORDER BY name asc");

    const optAll = await storage.getFilterOptions();
    const addedCats = optAll.categories.filter((c) => !catsBefore.has(c));
    assert.deepEqual(addedCats.sort(), [cChem, cElec, cFurn, cTool].sort());
    assert.ok(optAll.responsible.includes(rAmy));
    assert.ok(optAll.companies.some((c) => c.id === companyId));

    const emptyRestrict = await storage.getFilterOptions(undefined, []);
    assert.deepEqual(emptyRestrict, { categories: [], responsible: [], companies: [] });

    const unionSites = await storage.getFilterOptions(undefined, [site1Id, site2Id]);
    for (const c of [cChem, cElec, cFurn, cTool]) {
      assert.ok(unionSites.categories.includes(c), `union includes ${c}`);
    }

    process.env.SITE_SCOPING_ENABLED = "true";
    const scoped1 = await storage.getFilterOptions(site1Id);
    for (const c of [cElec, cFurn, cTool]) {
      assert.ok(scoped1.categories.includes(c), `site1 includes ${c}`);
    }
    assert.ok(!scoped1.categories.includes(cChem));

    const scopedUnion = await storage.getFilterOptions(undefined, [site1Id, site2Id]);
    for (const c of [cChem, cElec, cFurn, cTool]) {
      assert.ok(scopedUnion.categories.includes(c), `scoped union includes ${c}`);
    }

    t.after(async () => {
      await pool.query(`DELETE FROM inventory_items WHERE code = ANY($1::text[])`, [codes]);
      await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [site1Id, site2Id]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
      await pool.end();
    });
  });
});
