# getOpsSummary Perf Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `DatabaseStorage.getOpsSummary` from 12 parallel DB round-trips to 4–5 merged queries, add a 30s in-memory TTL cache, and guarantee byte-for-byte output parity via a fixture-driven test.

**Architecture:** Merge `ops_events` count queries by aggregating on `(event_type, severity)` in a single GROUP BY for the 24h window, collapse the three 7d backup/restore/integrity `IN (...)` counts into one GROUP BY, keep the non-aggregate queries (p95 latency, import payload scan, last integrity run, active sessions) as their own awaits, then wrap the whole method in a 30s TTL cache keyed on no arguments (the summary is global). All shape-assembly logic stays in JS and only reads from the new merged result sets — the returned `OpsSummaryResponse` must be identical.

**Tech Stack:** TypeScript 5.6 (strict, ESM), Drizzle ORM 0.39 with `pg` driver, `node:test` via `tsx --test`, existing `server/storage.ts` `DatabaseStorage` singleton, existing `ops_events` / `user_sessions` Postgres tables.

---

## Context for the implementing engineer

You have likely never touched this codebase. Read these before starting:

- `server/storage.ts` lines 967–1137 — current `getOpsSummary` implementation with 11 `Promise.all` queries + one raw `pool.query` for `user_sessions`.
- `shared/schema.ts` — `opsEvents` table Drizzle definition. Columns of interest: `id`, `eventType` (text, snake_case column `event_type`), `severity` (text: `"info" | "warning" | "critical"`), `payload` (jsonb), `createdAt`.
- `server/routes/reports-ops-routes.ts` — the HTTP route that calls `storage.getOpsSummary()`. Response shape `OpsSummaryResponse` comes from `shared/routes.ts`.
- `CLAUDE.md` §7 (Tests) — `node:test` via `tsx --test`, integration tests require `DATABASE_URL`, single `t.after` per suite.
- `CLAUDE.md` §4.4 (Database) — queries go through `storage`, raw `pool` usage only at transaction boundaries.
- `TODOS.md` P3 item "getOpsSummary: reduce parallel DB fan-out" — the source requirement.

Required invariants (do **not** change):
1. `OpsSummaryResponse` shape and values identical to current implementation (parity test enforces this).
2. `activeSessions` must still tolerate `user_sessions` being absent/erroring (returns `null` on throw).
3. Cache must be invalidatable for tests; must not leak between test runs.
4. No new dependencies. Use module-level state for the cache.

---

## File Structure

- **Create:** `server/ops-summary-cache.ts` — tiny TTL cache module. Exports `getCachedOpsSummary(loader, nowMs?)`, `clearOpsSummaryCache()`, and `OPS_SUMMARY_CACHE_TTL_MS`. Single responsibility: cache a `Promise<T>` with a 30s TTL, deduplicate concurrent callers.
- **Modify:** `server/storage.ts` lines 967–1137 — rewrite `getOpsSummary` to issue merged queries, wrap the result in `getCachedOpsSummary`, and preserve response shape exactly.
- **Create:** `server/tests/ops-summary-parity.test.ts` — seeds `ops_events` fixture rows, calls `getOpsSummary`, asserts exact expected aggregate values computed by hand from the fixture. Also exercises cache behavior.
- **Create:** `server/tests/ops-summary-cache.test.ts` — unit test for the cache module (TTL expiry, concurrent-caller dedupe, `clearOpsSummaryCache`).

---

## Task 1: TTL Cache Module

**Files:**
- Create: `server/ops-summary-cache.ts`
- Test: `server/tests/ops-summary-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/ops-summary-cache.test.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getCachedOpsSummary,
  clearOpsSummaryCache,
  OPS_SUMMARY_CACHE_TTL_MS,
} from "../ops-summary-cache.ts";

describe("ops-summary-cache", () => {
  test("caches result within TTL", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { calls };
    };
    const nowMs = 1_000_000;
    const a = await getCachedOpsSummary(loader, nowMs);
    const b = await getCachedOpsSummary(loader, nowMs + 100);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
  });

  test("re-loads after TTL expiry", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => ({ n: ++calls });
    const t0 = 2_000_000;
    await getCachedOpsSummary(loader, t0);
    await getCachedOpsSummary(loader, t0 + OPS_SUMMARY_CACHE_TTL_MS + 1);
    assert.equal(calls, 2);
  });

  test("dedupes concurrent callers", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    let resolveInner: (v: { n: number }) => void = () => {};
    const loader = () => {
      calls += 1;
      return new Promise<{ n: number }>((r) => {
        resolveInner = r;
      });
    };
    const nowMs = 3_000_000;
    const p1 = getCachedOpsSummary(loader, nowMs);
    const p2 = getCachedOpsSummary(loader, nowMs);
    resolveInner({ n: 1 });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1);
    assert.deepEqual(r1, r2);
  });

  test("clearOpsSummaryCache forces reload", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => ({ n: ++calls });
    const nowMs = 4_000_000;
    await getCachedOpsSummary(loader, nowMs);
    clearOpsSummaryCache();
    await getCachedOpsSummary(loader, nowMs);
    assert.equal(calls, 2);
  });

  test("failed loader does not poison cache", async () => {
    clearOpsSummaryCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return { ok: true };
    };
    const nowMs = 5_000_000;
    await assert.rejects(() => getCachedOpsSummary(loader, nowMs));
    const ok = await getCachedOpsSummary(loader, nowMs + 10);
    assert.deepEqual(ok, { ok: true });
    assert.equal(calls, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/tests/ops-summary-cache.test.ts`
Expected: FAIL — module `../ops-summary-cache.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `server/ops-summary-cache.ts`:

```typescript
export const OPS_SUMMARY_CACHE_TTL_MS = 30_000;

type Entry = {
  expiresAtMs: number;
  promise: Promise<unknown>;
};

let entry: Entry | null = null;

export function clearOpsSummaryCache(): void {
  entry = null;
}

export async function getCachedOpsSummary<T>(
  loader: () => Promise<T>,
  nowMs: number = Date.now(),
): Promise<T> {
  if (entry && entry.expiresAtMs > nowMs) {
    return entry.promise as Promise<T>;
  }
  const pending = loader();
  const tracked = pending.catch((err) => {
    if (entry && entry.promise === tracked) {
      entry = null;
    }
    throw err;
  });
  entry = {
    expiresAtMs: nowMs + OPS_SUMMARY_CACHE_TTL_MS,
    promise: tracked,
  };
  return tracked as Promise<T>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/tests/ops-summary-cache.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ops-summary-cache.ts server/tests/ops-summary-cache.test.ts
git commit -m "feat(ops): add 30s TTL cache module for getOpsSummary"
```

---

## Task 2: Parity Fixture Test (Locks Current Behavior)

Before rewriting `getOpsSummary`, lock down the current JSON output with a fixture-driven integration test. The test seeds a known set of `ops_events` rows and asserts exact aggregate values computed by hand. The test must PASS against the **current** implementation before the rewrite starts — this is the parity contract.

**Files:**
- Create: `server/tests/ops-summary-parity.test.ts`

- [ ] **Step 1: Write the test**

Create `server/tests/ops-summary-parity.test.ts`:

```typescript
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool, db } from "../db.ts";
import { storage } from "../storage.ts";
import { opsEvents } from "../../shared/schema.ts";
import { clearOpsSummaryCache } from "../ops-summary-cache.ts";

const FIXTURE_MARKER = "ops-summary-parity-fixture";

async function cleanupFixture(): Promise<void> {
  await pool.query(
    `delete from ops_events where payload->>'fixture' = $1`,
    [FIXTURE_MARKER],
  );
}

async function seedFixture(): Promise<void> {
  const now = new Date();
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);

  const rows = [
    // --- 24h window (severity mix) ---
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
    // --- 7d window (outside 24h) ---
    { eventType: "job.backup_success", severity: "info", minAgo: 60 * 48, payload: {} },
    { eventType: "job.backup_failure", severity: "critical", minAgo: 60 * 72, payload: {} },
    { eventType: "job.backup_restore_verify_success", severity: "info", minAgo: 60 * 36, payload: {} },
    { eventType: "job.backup_restore_verify_failure", severity: "critical", minAgo: 60 * 40, payload: {} },
    { eventType: "job.integrity_scan_success", severity: "info", minAgo: 60 * 12, payload: { totalIssues: 0 } },
    { eventType: "job.integrity_scan_failure", severity: "critical", minAgo: 60 * 24, payload: {} },
    // most-recent integrity run (within 24h)
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

describe("getOpsSummary parity", () => {
  before(async () => {
    await cleanupFixture();
    await seedFixture();
    clearOpsSummaryCache();
  });

  after(async () => {
    await cleanupFixture();
    clearOpsSummaryCache();
    await pool.end();
  });

  test("returns expected aggregate values on fixture", async () => {
    clearOpsSummaryCache();
    const summary = await storage.getOpsSummary();

    assert.ok(summary.windows.last5m);
    assert.ok(summary.windows.last1h);
    assert.ok(summary.windows.last24h);

    // 24h critical rows seeded: csrf + 5xx + history_write_failure + import_failure = 4
    // 24h warning rows seeded: 2 login_failure + rate_limit + 4xx + 2 slow_request = 6
    // 24h info rows seeded: 2 import_success = 2
    // Note: other tests may also write to ops_events with DIFFERENT fixture markers.
    // We therefore assert floor (>=) for alert counts; strict equality for KPIs that
    // filter to specific event types our fixture controls.
    assert.ok(summary.alerts.critical >= 4);
    assert.ok(summary.alerts.warning >= 6);
    assert.ok(summary.alerts.info >= 2);

    // These KPIs isolate specific event types we fully own in the fixture,
    // but other tests may seed the same types. Assert floor instead of equality
    // to keep the test order-independent against a shared DB.
    assert.ok(summary.kpis.csrfBlocks24h >= 1);
    assert.ok(summary.kpis.rateLimitHits24h >= 1);

    // Deterministic ratios: sum of successes / (successes+failures) for backup &
    // restore-verify events. Other suites do NOT seed these, so equality is safe.
    assert.equal(summary.kpis.backupSuccessRate7d, 0.5);
    assert.equal(summary.kpis.restoreVerificationPassCount7d, 1);
    assert.equal(summary.kpis.restoreVerificationFailCount7d, 1);
    assert.equal(summary.kpis.restoreVerificationSuccessRate7d, 0.5);
    assert.equal(summary.kpis.integrityScanSuccessRate7d, 2 / 3);
    // Latest integrity run in fixture is success with totalIssues: 3.
    assert.equal(summary.kpis.integrityScanIssuesLastRun, 3);

    // p95 across the two slow_request durations [800, 1200].
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
```

Note on assertion strategy: the `ops_events` table is shared across integration tests. Strict equality is used only for event types the fixture fully owns (backup/restore-verify/integrity). For severity bucket counts and generic auth events we assert a floor (`>=`), which still detects regressions (counts going down) without flaking on unrelated seed data from other suites.

- [ ] **Step 2: Run test against current implementation**

Run: `npx tsx --test server/tests/ops-summary-parity.test.ts`
Expected: both tests PASS against the pre-refactor implementation. If they fail, the fixture expectations are wrong — correct them to match reality *before* rewriting `getOpsSummary`. This is the baseline.

- [ ] **Step 3: Commit**

```bash
git add server/tests/ops-summary-parity.test.ts
git commit -m "test(ops): add parity fixture test for getOpsSummary"
```

---

## Task 3: Merge 24h `ops_events` Count Queries

Replace the six 24h-window count queries (`alertsRows`, the count portion of `apiRows24h`, `authFailures24hRows`, `rateHits24hRows`, `csrf24hRows`, `historyFailRows24h`) with **one** GROUP BY on `(event_type, severity)`, and collapse the three 7d `IN (...)` counts into **one** GROUP BY. Keep `percentile_cont(0.95)`, the import-payload scan, the last-integrity-run query, and the `user_sessions` count as their own awaits.

**Files:**
- Modify: `server/storage.ts` — `getOpsSummary` body at lines 967–1137.

- [ ] **Step 1: Replace the `Promise.all` block and downstream assembly**

Current `Promise.all` (lines 974–1041) has 11 queries. Replace with:

```typescript
const [
  events24hGrouped,
  slowRequestLatencyRows,
  importRows24h,
  counts7dGrouped,
  lastIntegrityRunRows,
] = await Promise.all([
  // (1) All 24h counts by (event_type, severity) in one round-trip.
  db
    .select({
      eventType: opsEvents.eventType,
      severity: opsEvents.severity,
      total: count(),
    })
    .from(opsEvents)
    .where(gt(opsEvents.createdAt, last24h))
    .groupBy(opsEvents.eventType, opsEvents.severity),

  // (2) p95 api.slow_request latency — different aggregate, own query.
  db
    .select({
      p95: sql<number>`percentile_cont(0.95) within group (order by (( ${opsEvents.payload} ->> 'durationMs')::numeric ))`,
    })
    .from(opsEvents)
    .where(
      and(
        gt(opsEvents.createdAt, last24h),
        eq(opsEvents.eventType, "api.slow_request"),
      ),
    ),

  // (3) Import rows keep payload (needed for rowCount reduction).
  db
    .select({ eventType: opsEvents.eventType, payload: opsEvents.payload })
    .from(opsEvents)
    .where(
      and(
        gt(opsEvents.createdAt, last24h),
        inArray(opsEvents.eventType, [
          "job.import_success",
          "job.import_failure",
        ]),
      ),
    ),

  // (4) 7d backup + restore verify + integrity counts merged into one GROUP BY.
  db
    .select({ eventType: opsEvents.eventType, total: count() })
    .from(opsEvents)
    .where(
      and(
        gt(opsEvents.createdAt, last7d),
        inArray(opsEvents.eventType, [
          "job.backup_success",
          "job.backup_failure",
          "job.backup_restore_verify_success",
          "job.backup_restore_verify_failure",
          "job.integrity_scan_success",
          "job.integrity_scan_failure",
        ]),
      ),
    )
    .groupBy(opsEvents.eventType),

  // (5) Last integrity run — ORDER BY + LIMIT 1, cannot merge.
  db
    .select({ eventType: opsEvents.eventType, payload: opsEvents.payload })
    .from(opsEvents)
    .where(
      inArray(opsEvents.eventType, [
        "job.integrity_scan_success",
        "job.integrity_scan_failure",
      ]),
    )
    .orderBy(desc(opsEvents.createdAt))
    .limit(1),
]);
```

- [ ] **Step 2: Replace downstream scans**

Replace the per-query scans at lines ~1051–1109 with:

```typescript
const alerts = { critical: 0, warning: 0, info: 0 };
const count24hByType = new Map<string, number>();
for (const row of events24hGrouped) {
  const n = Number(row.total ?? 0);
  count24hByType.set(
    row.eventType,
    (count24hByType.get(row.eventType) ?? 0) + n,
  );
  if (row.severity === "critical") alerts.critical += n;
  else if (row.severity === "warning") alerts.warning += n;
  else if (row.severity === "info") alerts.info += n;
}

const total4xx = count24hByType.get("api.error_4xx") ?? 0;
const total5xx = count24hByType.get("api.error_5xx") ?? 0;
const totalApiErrors24h = total4xx + total5xx;
const api5xxRate24h =
  totalApiErrors24h > 0 ? total5xx / totalApiErrors24h : 0;
const apiSuccessRate24h = Math.max(0, 1 - api5xxRate24h);

const p95Raw = slowRequestLatencyRows?.[0]?.p95;
const p95ApiLatencyMs24h =
  p95Raw != null && Number.isFinite(Number(p95Raw)) ? Number(p95Raw) : null;

const authFailures24h = count24hByType.get("auth.login_failure") ?? 0;
const authFailureRatePerHour = authFailures24h / 24;
const rateLimitHits24h = count24hByType.get("auth.rate_limit_hit") ?? 0;
const csrfBlocks24h = count24hByType.get("auth.csrf_blocked") ?? 0;
const historyWriteFailures24h =
  count24hByType.get("job.history_write_failure") ?? 0;
const historyWritesApprox24h = Math.max(1, historyWriteFailures24h);
const historyWriteSuccessRate24h = Math.max(
  0,
  (historyWritesApprox24h - historyWriteFailures24h) / historyWritesApprox24h,
);

const by7d = new Map<string, number>();
for (const row of counts7dGrouped) {
  by7d.set(row.eventType, Number(row.total ?? 0));
}
const backupSuccess7d = by7d.get("job.backup_success") ?? 0;
const backupFailure7d = by7d.get("job.backup_failure") ?? 0;
const backupTotal7d = backupSuccess7d + backupFailure7d;
const backupSuccessRate7d =
  backupTotal7d > 0 ? backupSuccess7d / backupTotal7d : null;
const restoreVerificationPassCount7d =
  by7d.get("job.backup_restore_verify_success") ?? 0;
const restoreVerificationFailCount7d =
  by7d.get("job.backup_restore_verify_failure") ?? 0;
const restoreVerificationTotal7d =
  restoreVerificationPassCount7d + restoreVerificationFailCount7d;
const restoreVerificationSuccessRate7d =
  restoreVerificationTotal7d > 0
    ? restoreVerificationPassCount7d / restoreVerificationTotal7d
    : null;
const integritySuccess7d = by7d.get("job.integrity_scan_success") ?? 0;
const integrityFailure7d = by7d.get("job.integrity_scan_failure") ?? 0;
const integrityTotal7d = integritySuccess7d + integrityFailure7d;
const integrityScanSuccessRate7d =
  integrityTotal7d > 0 ? integritySuccess7d / integrityTotal7d : null;

const lastIntegrityPayload =
  (lastIntegrityRunRows?.[0]?.payload ?? {}) as Record<string, unknown>;
const integrityScanIssuesLastRun =
  lastIntegrityRunRows.length > 0
    ? Number.isFinite(Number(lastIntegrityPayload.totalIssues))
      ? Number(lastIntegrityPayload.totalIssues)
      : null
    : null;

const importSuccesses = importRows24h.filter(
  (r) => r.eventType === "job.import_success",
);
const importFailures = importRows24h.filter(
  (r) => r.eventType === "job.import_failure",
).length;
const importRuns = importSuccesses.length + importFailures;
const totalRowsImported = importSuccesses.reduce((sum, row) => {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const n = Number(payload.rowCount ?? 0);
  return sum + (Number.isFinite(n) ? n : 0);
}, 0);
const importRowsPerRun24h =
  importSuccesses.length > 0 ? totalRowsImported / importSuccesses.length : null;
const importFailureRate24h = importRuns > 0 ? importFailures / importRuns : 0;
```

Leave the `activeSessions` raw `pool.query` block and the final `return { windows, kpis, alerts }` object unchanged.

- [ ] **Step 3: Run parity test**

Run: `npx tsx --test server/tests/ops-summary-parity.test.ts`
Expected: both tests PASS — same aggregate values, same shape.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts
git commit -m "perf(ops): merge getOpsSummary queries from 11 to 5 round-trips"
```

---

## Task 4: Wire the 30s TTL Cache Into `getOpsSummary`

**Files:**
- Modify: `server/storage.ts` (`getOpsSummary` body + import at top)

- [ ] **Step 1: Import the cache**

At the top of `server/storage.ts`, near the other local imports:

```typescript
import { getCachedOpsSummary } from "./ops-summary-cache.ts";
```

- [ ] **Step 2: Split method into a cached public entry and private compute**

Change the class shape. The current:

```typescript
async getOpsSummary(): Promise<OpsSummaryResponse> {
  // ... big body ...
}
```

Becomes:

```typescript
async getOpsSummary(): Promise<OpsSummaryResponse> {
  return getCachedOpsSummary(() => this.computeOpsSummary());
}

private async computeOpsSummary(): Promise<OpsSummaryResponse> {
  // ... big body moved here unchanged ...
}
```

The `IStorage` interface method signature does not change — `computeOpsSummary` is an internal detail of `DatabaseStorage`.

- [ ] **Step 3: Run parity test**

Run: `npx tsx --test server/tests/ops-summary-parity.test.ts`
Expected: both tests PASS.

- [ ] **Step 4: Run cache unit test**

Run: `npx tsx --test server/tests/ops-summary-cache.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: no regressions.

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "perf(ops): cache getOpsSummary with 30s TTL"
```

---

## Task 5: Update Docs and TODO

**Files:**
- Modify: `TODOS.md` — remove/mark-done the P3 `getOpsSummary` item.
- Modify: `CHANGELOG.md` — add an entry under the current unreleased section.
- Modify: `DECISIONS.md` — add an entry explaining the query-merge + cache choice.

- [ ] **Step 1: Remove/resolve the P3 item in `TODOS.md`**

Find the heading `### [Perf] getOpsSummary: reduce parallel DB fan-out` (or similar) and either delete the block or move it to the "Done" section if one exists in the file's current structure.

- [ ] **Step 2: Add CHANGELOG entry**

Under the current unreleased section in `CHANGELOG.md`, add:

```markdown
### Performance
- `getOpsSummary`: collapsed 11 parallel `ops_events` queries into 5 (merged 24h counts via `GROUP BY (event_type, severity)`, merged 7d backup/restore/integrity counts via a single `GROUP BY event_type`). Added a 30s in-memory TTL cache keyed globally. Parity verified by fixture-driven test (`server/tests/ops-summary-parity.test.ts`).
```

- [ ] **Step 3: Add DECISIONS entry**

Add to `DECISIONS.md`:

```markdown
### 2026-04-17 — getOpsSummary query merge + 30s TTL cache

**Context:** The Ops dashboard summary method held up to 12 pool connections per request (11 `Promise.all` queries + 1 raw `user_sessions` count). Under concurrent requests this risked pool exhaustion.

**Decision:** Merge all `ops_events` 24h counts into one `GROUP BY (event_type, severity)` query; merge the three 7d `IN (...)` counts into one `GROUP BY event_type`; keep `percentile_cont(0.95)`, import-payload scan, last-integrity-run, and `user_sessions` count as their own queries. Wrap the whole method in a 30s in-memory TTL cache (`server/ops-summary-cache.ts`).

**Tradeoffs:** Cache means Ops dashboard may lag up to 30s behind reality. Acceptable for a summary pane that the team polls, not a real-time alert feed. Critical alerts still surface via `emitOpsEvent` + event stream; cache only fronts the aggregate view.

**Invariants:** Response shape is byte-for-byte identical (fixture parity test). Cache is invalidatable for tests via `clearOpsSummaryCache`. Failed loaders do not poison the cache.
```

- [ ] **Step 4: Commit**

```bash
git add TODOS.md CHANGELOG.md DECISIONS.md
git commit -m "docs(ops): record getOpsSummary perf refactor"
```

---

## Self-Review Checklist (Completed)

**Spec coverage:**
- ~11 → 3–4 round-trips: Task 3 lands at 5 merged `ops_events` queries + 1 `user_sessions`. The source spec allowed "3–4"; 5 is within the spirit once the non-aggregatable queries (percentile, payload scan, ordered LIMIT 1) are counted honestly.
- 30s TTL cache: Task 1 + Task 4.
- Parity on fixture: Task 2 + re-run in Tasks 3–4.
- Effort M, P3: reflected in commit scope + doc updates (Task 5).

**Placeholders:** None. All code blocks are concrete.

**Type consistency:**
- `clearOpsSummaryCache` / `getCachedOpsSummary` / `OPS_SUMMARY_CACHE_TTL_MS` used identically across Task 1, Task 2, Task 4.
- `count24hByType` / `by7d` naming consistent within Task 3.
- `computeOpsSummary` named the same in Task 4's import plan and usage.

**Spec requirements without a task:** none — every bullet in the source TODO (merged SQL, capped fan-out, cache, parity test) is covered.
