import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { opsEvents } from "@shared/schema";
import { clearOpsSummaryCache } from "../ops-summary-cache";

const FIXTURE_MARKER = "ops-summary-parity-fixture";
const defaultTestDbUrl = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";

describe("getOpsSummary parity", () => {
  let pool: typeof import("../db").pool;
  let db: typeof import("../db").db;
  let storage: typeof import("../storage").storage;

  before(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      process.env.DATABASE_URL = defaultTestDbUrl;
    }
    const dbMod = await import("../db");
    pool = dbMod.pool;
    db = dbMod.db;
    const st = await import("../storage");
    storage = st.storage;
    await cleanupFixture(pool);
    await seedFixture(db);
    clearOpsSummaryCache();
  });

  after(async () => {
    await cleanupFixture(pool);
    clearOpsSummaryCache();
  });

  test("returns expected aggregate values on fixture", async () => {
    clearOpsSummaryCache();
    const summary = await storage.getOpsSummary();

    assert.ok(summary.windows.last5m);
    assert.ok(summary.windows.last1h);
    assert.ok(summary.windows.last24h);

    assert.ok(summary.alerts.critical >= 4);
    assert.ok(summary.alerts.warning >= 6);
    assert.ok(summary.alerts.info >= 2);

    assert.ok(summary.kpis.csrfBlocks24h >= 1);
    assert.ok(summary.kpis.rateLimitHits24h >= 1);

    assert.equal(summary.kpis.backupSuccessRate7d, 0.5);
    assert.equal(summary.kpis.restoreVerificationPassCount7d, 1);
    assert.equal(summary.kpis.restoreVerificationFailCount7d, 1);
    assert.equal(summary.kpis.restoreVerificationSuccessRate7d, 0.5);
    assert.equal(summary.kpis.integrityScanSuccessRate7d, 2 / 3);
    assert.equal(summary.kpis.integrityScanIssuesLastRun, 3);

    assert.ok(summary.kpis.p95ApiLatencyMs24h !== null);
    assert.ok((summary.kpis.p95ApiLatencyMs24h as number) >= 800);
    assert.ok((summary.kpis.p95ApiLatencyMs24h as number) <= 1200);

    assert.ok(
      summary.kpis.activeSessions === null ||
        typeof summary.kpis.activeSessions === "number",
    );
  });

  test("two consecutive calls return deep-equal payloads (cache-safe)", async () => {
    clearOpsSummaryCache();
    const a = await storage.getOpsSummary();
    const b = await storage.getOpsSummary();
    assert.deepEqual(a, b);
  });
});

async function cleanupFixture(pool: typeof import("../db").pool): Promise<void> {
  await pool.query(`delete from ops_events where payload->>'fixture' = $1`, [FIXTURE_MARKER]);
}

async function seedFixture(db: typeof import("../db").db): Promise<void> {
  const now = new Date();
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);

  const rows = [
    { eventType: "auth.login_failure", severity: "warning", minAgo: 10, payload: {} },
    { eventType: "auth.login_failure", severity: "warning", minAgo: 20, payload: {} },
    { eventType: "auth.rate_limit_hit", severity: "warning", minAgo: 30, payload: {} },
    { eventType: "auth.csrf_blocked", severity: "critical", minAgo: 40, payload: {} },
    { eventType: "api.error_4xx", severity: "warning", minAgo: 50, payload: { durationMs: 120 } },
    { eventType: "api.error_5xx", severity: "critical", minAgo: 60, payload: { durationMs: 500 } },
    { eventType: "api.slow_request", severity: "warning", minAgo: 65, payload: { durationMs: 800 } },
    { eventType: "api.slow_request", severity: "warning", minAgo: 70, payload: { durationMs: 1200 } },
    { eventType: "job.history_write_failure", severity: "critical", minAgo: 80, payload: {} },
    { eventType: "job.import_success", severity: "info", minAgo: 90, payload: { rowCount: 100 } },
    { eventType: "job.import_success", severity: "info", minAgo: 95, payload: { rowCount: 200 } },
    { eventType: "job.import_failure", severity: "critical", minAgo: 100, payload: {} },
    { eventType: "job.backup_success", severity: "info", minAgo: 60 * 48, payload: {} },
    { eventType: "job.backup_failure", severity: "critical", minAgo: 60 * 72, payload: {} },
    { eventType: "job.backup_restore_verify_success", severity: "info", minAgo: 60 * 36, payload: {} },
    { eventType: "job.backup_restore_verify_failure", severity: "critical", minAgo: 60 * 40, payload: {} },
    { eventType: "job.integrity_scan_success", severity: "info", minAgo: 60 * 12, payload: { totalIssues: 0 } },
    { eventType: "job.integrity_scan_failure", severity: "critical", minAgo: 60 * 24, payload: {} },
    { eventType: "job.integrity_scan_success", severity: "info", minAgo: 5, payload: { totalIssues: 3 } },
  ] as const;

  for (const r of rows) {
    await db.insert(opsEvents).values({
      eventType: r.eventType,
      severity: r.severity,
      payload: { ...r.payload, fixture: FIXTURE_MARKER },
      createdAt: at(r.minAgo),
    });
  }
}
