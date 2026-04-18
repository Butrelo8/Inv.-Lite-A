# Bootstrap Tables Schema Reconciliation — Implementation Plan

> **For agentic workers:** :  implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflect the three bootstrap tables (`user_sessions`, `login_rate_limits`, `ops_events`) in `shared/schema.ts` plus an idempotent reconciliation migration, so `drizzle-kit push` no longer proposes dropping them and fresh installs can be built from migrations alone.

**Architecture:** Add Drizzle table definitions that exactly match the columns/indexes/PK created by the startup SQL in `server/auth.ts`, `server/rate-limiter.ts`, `server/ops-events.ts`. Add a consolidated migration `migrations/add-bootstrap-tables.sql` that is a no-op on existing installs (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and a `DO $$` block for the sessions PK repair). Add a `script/migrate-bootstrap-tables.ts` runner mirroring `script/migrate-webhooks.ts`. Keep the startup bootstrap SQL in place as a belt-and-suspenders safeguard. Introspect a live DB with `drizzle-kit check` to prove no diff.

**Tech Stack:** Drizzle ORM 0.39 (`pgTable`, `varchar`, `text`, `serial`, `integer`, `json`, `jsonb`, `timestamp`, `index`), PostgreSQL 16, `tsx`, `node:test`.

---

## File Structure

Files created:

- `migrations/add-bootstrap-tables.sql` — idempotent SQL matching startup bootstrap.
- `script/migrate-bootstrap-tables.ts` — tsx runner, reads and executes the SQL above.
- `server/tests/bootstrap-tables-parity.test.ts` — introspects `information_schema` and `pg_indexes` after applying the migration, asserts column/index shape matches what the startup paths create; also asserts the Drizzle exports exist.

Files modified:

- `shared/schema.ts` — three new `pgTable` exports (`userSessions`, `loginRateLimits`, `opsEvents`) and inferred `$inferSelect` types. Add `varchar` and `json` to the pg-core import.
- `docs/BACKUP-RESTORE.md` — append a "Do not drop bootstrap tables with `drizzle-kit push`" section pointing at the new migration.
- `STATE.md` — flip the blocker from "three bootstrap tables not in schema" to "reconciled on 2026-04-17; see migration `add-bootstrap-tables.sql`".
- `CHANGELOG.md` — one-line entry under current unreleased section.

Files **not** modified (intentional):

- `server/auth.ts`, `server/rate-limiter.ts`, `server/ops-events.ts` — keep startup bootstrap SQL unchanged. Fresh Docker installs may start before migrations run; keeping the in-code guards is the belt, the migration is the suspenders.

---

## Ground Truth Column Shapes

Copy-paste verbatim from current source to remove guesswork later.

### `user_sessions` (from `server/auth.ts:60-107`)

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
-- Primary key: (sid) — added via DO $$ block that repairs a wrong-column PK if one exists.
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);
```

### `login_rate_limits` (from `server/rate-limiter.ts:15-21`)

```sql
CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL
);
```

### `ops_events` (from `server/ops-events.ts:21-40` and `migrations/add-ops-events.sql`)

```sql
CREATE TABLE IF NOT EXISTS ops_events (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL DEFAULT 'api',
  environment text NOT NULL DEFAULT 'development',
  payload jsonb,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ip text,
  request_id text,
  endpoint text,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_events_event_type_created_at_idx ON ops_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS ops_events_created_at_idx ON ops_events (created_at);
CREATE INDEX IF NOT EXISTS ops_events_severity_created_at_idx ON ops_events (severity, created_at);
```

`add-ops-events.sql` already exists. The new `add-bootstrap-tables.sql` re-runs the same ops_events DDL (guarded by `IF NOT EXISTS`) so one migration covers all three bootstrap tables for future operators. Duplication is intentional — both files are idempotent and safe to apply twice.

---

## Task 1: Reconciliation migration SQL

**Files:**
- Create: `migrations/add-bootstrap-tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Reconciliation migration for the three "bootstrap" tables that live in the app's
-- startup code (server/auth.ts, server/rate-limiter.ts, server/ops-events.ts).
-- Safe to apply against:
--   (a) a fresh database — creates the tables and indexes;
--   (b) an existing database that already has them — every statement is guarded
--       by IF NOT EXISTS or a DO $$ block and is a no-op.

-- ---------------- user_sessions ----------------
CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

-- Ensure PK is on (sid). Mirrors the repair block in server/auth.ts so operators
-- who imported a backup with a wrong PK get healed here too.
DO $$
DECLARE
  existing_pk_name text;
  existing_pk_is_sid boolean;
BEGIN
  SELECT c.conname,
         EXISTS (
           SELECT 1
           FROM unnest(c.conkey) AS k(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid
            AND a.attnum = k.attnum
           WHERE a.attname = 'sid'
         ) AND array_length(c.conkey, 1) = 1
  INTO existing_pk_name, existing_pk_is_sid
  FROM pg_constraint c
  WHERE c.conrelid = 'user_sessions'::regclass
    AND c.contype = 'p'
  LIMIT 1;

  IF existing_pk_name IS NULL THEN
    ALTER TABLE user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);
  ELSIF NOT existing_pk_is_sid THEN
    EXECUTE format('ALTER TABLE user_sessions DROP CONSTRAINT %I', existing_pk_name);
    ALTER TABLE user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);

-- ---------------- login_rate_limits ----------------
CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL
);

-- ---------------- ops_events ----------------
CREATE TABLE IF NOT EXISTS ops_events (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL DEFAULT 'api',
  environment text NOT NULL DEFAULT 'development',
  payload jsonb,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ip text,
  request_id text,
  endpoint text,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_events_event_type_created_at_idx ON ops_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS ops_events_created_at_idx ON ops_events (created_at);
CREATE INDEX IF NOT EXISTS ops_events_severity_created_at_idx ON ops_events (severity, created_at);
```

- [ ] **Step 2: Apply against a scratch DB twice, verify idempotency**

```bash
createdb inventario_reconcile_test
psql "postgresql://inventario:inventario@127.0.0.1/inventario_reconcile_test" \
  -f migrations/add-bootstrap-tables.sql
psql "postgresql://inventario:inventario@127.0.0.1/inventario_reconcile_test" \
  -f migrations/add-bootstrap-tables.sql
dropdb inventario_reconcile_test
```

Expected: both `psql` invocations exit 0. `NOTICE: relation ... already exists, skipping` on the second run is acceptable; no `ERROR:` lines. The second run also exercises the DO $$ block against a table that already has the correct PK — it should no-op silently.

- [ ] **Step 3: Commit**

```bash
git add migrations/add-bootstrap-tables.sql
git commit -m "feat: idempotent reconciliation migration for bootstrap tables"
```

---

## Task 2: Migration runner script

**Files:**
- Create: `script/migrate-bootstrap-tables.ts`

- [ ] **Step 1: Write the runner, mirroring `script/migrate-webhooks.ts`**

```typescript
import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const sqlPath = path.join(process.cwd(), "migrations", "add-bootstrap-tables.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    await pool.query(sql);
    console.log("Migration done: bootstrap tables reconciled.");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
```

- [ ] **Step 2: Run it end-to-end against the dev DB**

```bash
npx tsx script/migrate-bootstrap-tables.ts
```

Expected stdout: `Migration done: bootstrap tables reconciled.`

- [ ] **Step 3: Commit**

```bash
git add script/migrate-bootstrap-tables.ts
git commit -m "feat: tsx runner for bootstrap-tables migration"
```

---

## Task 3: Parity test — migration output matches startup bootstrap output

**Files:**
- Create: `server/tests/bootstrap-tables-parity.test.ts`

This test applies the migration, introspects `information_schema` / `pg_indexes` / `pg_constraint`, and asserts exact column / index / PK shape. It protects against a future edit drifting the migration away from what the startup code creates.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://inventario:inventario@127.0.0.1/inventario";

const pool = new Pool({ connectionString: DATABASE_URL });

async function applyMigration() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "migrations", "add-bootstrap-tables.sql"),
    "utf-8",
  );
  await pool.query(sql);
}

async function columnShape(table: string) {
  const r = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((c) => [c.column_name, c.data_type, c.is_nullable] as const);
}

async function indexNames(table: string) {
  const r = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [table],
  );
  return r.rows.map((x) => x.indexname);
}

async function primaryKeyColumns(table: string) {
  const r = await pool.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = $1::regclass AND c.contype = 'p'
     ORDER BY a.attnum`,
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

describe("bootstrap-tables migration parity", () => {
  before(async () => {
    await applyMigration();
  });

  after(async () => {
    await pool.end();
  });

  test("user_sessions shape matches startup bootstrap", async () => {
    assert.deepEqual(await columnShape("user_sessions"), [
      ["sid", "character varying", "NO"],
      ["sess", "json", "NO"],
      ["expire", "timestamp without time zone", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns("user_sessions"), ["sid"]);
    assert.ok((await indexNames("user_sessions")).includes("IDX_user_sessions_expire"));
  });

  test("login_rate_limits shape matches startup bootstrap", async () => {
    assert.deepEqual(await columnShape("login_rate_limits"), [
      ["key", "text", "NO"],
      ["window_start", "timestamp with time zone", "NO"],
      ["count", "integer", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns("login_rate_limits"), ["key"]);
  });

  test("ops_events shape matches startup bootstrap", async () => {
    assert.deepEqual(await columnShape("ops_events"), [
      ["id", "integer", "NO"],
      ["event_type", "text", "NO"],
      ["severity", "text", "NO"],
      ["source", "text", "NO"],
      ["environment", "text", "NO"],
      ["payload", "jsonb", "YES"],
      ["user_id", "integer", "YES"],
      ["ip", "text", "YES"],
      ["request_id", "text", "YES"],
      ["endpoint", "text", "YES"],
      ["method", "text", "YES"],
      ["created_at", "timestamp with time zone", "NO"],
    ]);
    assert.deepEqual(await primaryKeyColumns("ops_events"), ["id"]);
    const idx = await indexNames("ops_events");
    assert.ok(idx.includes("ops_events_event_type_created_at_idx"));
    assert.ok(idx.includes("ops_events_created_at_idx"));
    assert.ok(idx.includes("ops_events_severity_created_at_idx"));
  });
});
```

- [ ] **Step 2: Run it — expect PASS after Task 1 has been applied to the dev DB**

```bash
npm test -- --test-name-pattern="bootstrap-tables migration parity"
```

Expected: all three tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/tests/bootstrap-tables-parity.test.ts
git commit -m "test: parity between bootstrap-tables migration and information_schema"
```

---

## Task 4: Drizzle table — `userSessions`

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/tests/bootstrap-tables-parity.test.ts` (append drizzle-export tests)

- [ ] **Step 1: Append the failing Drizzle export test**

Append at the bottom of `server/tests/bootstrap-tables-parity.test.ts`:

```typescript
import { userSessions, loginRateLimits, opsEvents } from "@shared/schema";

describe("bootstrap-tables drizzle exports", () => {
  test("userSessions exports with the expected column keys", () => {
    assert.ok("sid" in userSessions);
    assert.ok("sess" in userSessions);
    assert.ok("expire" in userSessions);
  });

  test("loginRateLimits exports with the expected column keys", () => {
    assert.ok("key" in loginRateLimits);
    assert.ok("windowStart" in loginRateLimits);
    assert.ok("count" in loginRateLimits);
  });

  test("opsEvents exports with the expected column keys", () => {
    for (const k of [
      "id",
      "eventType",
      "severity",
      "source",
      "environment",
      "payload",
      "userId",
      "ip",
      "requestId",
      "endpoint",
      "method",
      "createdAt",
    ]) {
      assert.ok(k in opsEvents, `missing column ${k}`);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL with module-not-found-style error**

```bash
npm test -- --test-name-pattern="bootstrap-tables drizzle exports"
```

Expected: import of `userSessions` / `loginRateLimits` / `opsEvents` from `@shared/schema` fails (these exports do not exist yet).

- [ ] **Step 3: Update the pg-core import in `shared/schema.ts`**

Change the existing import line at the top of `shared/schema.ts`:

```typescript
import { pgTable, text, serial, integer, date, timestamp, jsonb, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
```

to:

```typescript
import { pgTable, text, serial, integer, date, timestamp, json, jsonb, index, uniqueIndex, boolean, varchar } from "drizzle-orm/pg-core";
```

- [ ] **Step 4: Append `userSessions` to the end of `shared/schema.ts`**

```typescript
/**
 * Express session store (connect-pg-simple). Created at startup by
 * `server/auth.ts` and by `migrations/add-bootstrap-tables.sql`. Keep columns,
 * index name, and PK in lockstep with both of those.
 *
 * NOTE: column type is `json` (not `jsonb`) — connect-pg-simple writes `json`
 * and the existing bootstrap SQL matches that.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey().notNull(),
    sess: json("sess").notNull().$type<Record<string, unknown>>(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_user_sessions_expire").on(table.expire),
  }),
);

export type UserSession = typeof userSessions.$inferSelect;
```

- [ ] **Step 5: Run tests, expect `userSessions` test PASS, the other two still FAIL**

```bash
npm test -- --test-name-pattern="bootstrap-tables drizzle exports"
```

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/tests/bootstrap-tables-parity.test.ts
git commit -m "feat(schema): declare user_sessions table in Drizzle schema"
```

---

## Task 5: Drizzle table — `loginRateLimits`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Append `loginRateLimits` below `userSessions`**

```typescript
/**
 * Per-IP and per-IP+username login throttle state. Created at startup by
 * `server/rate-limiter.ts` and by `migrations/add-bootstrap-tables.sql`.
 */
export const loginRateLimits = pgTable("login_rate_limits", {
  key: text("key").primaryKey().notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

export type LoginRateLimit = typeof loginRateLimits.$inferSelect;
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --test-name-pattern="bootstrap-tables drizzle exports"
```

Expected: `userSessions` and `loginRateLimits` PASS; `opsEvents` still FAIL.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): declare login_rate_limits table in Drizzle schema"
```

---

## Task 6: Drizzle table — `opsEvents`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Append `opsEvents` below `loginRateLimits`**

```typescript
/**
 * Ops/security observability events. Created at startup by `server/ops-events.ts`,
 * also covered by `migrations/add-ops-events.sql` and
 * `migrations/add-bootstrap-tables.sql`. Columns and indexes must stay in
 * lockstep with those two SQL files.
 */
export const opsEvents = pgTable(
  "ops_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull(),
    source: text("source").notNull().default("api"),
    environment: text("environment").notNull().default("development"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: text("ip"),
    requestId: text("request_id"),
    endpoint: text("endpoint"),
    method: text("method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypeCreatedAtIdx: index("ops_events_event_type_created_at_idx").on(
      table.eventType,
      table.createdAt,
    ),
    createdAtIdx: index("ops_events_created_at_idx").on(table.createdAt),
    severityCreatedAtIdx: index("ops_events_severity_created_at_idx").on(
      table.severity,
      table.createdAt,
    ),
  }),
);

export type OpsEvent = typeof opsEvents.$inferSelect;
```

- [ ] **Step 2: Run every new test**

```bash
npm test -- --test-name-pattern="bootstrap-tables"
```

Expected: every test in `bootstrap-tables-parity.test.ts` PASS.

- [ ] **Step 3: Run full type check and full suite**

```bash
npm run check
npm test
```

Expected: both exit 0. `npm run check` catches any drizzle-inferred type collision with `storage.addOpsEvent` (which already writes these columns).

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): declare ops_events table in Drizzle schema"
```

---

## Task 7: Validate drizzle-kit sees no diff

Proof that the drift is closed.

- [ ] **Step 1: Run `drizzle-kit check` against the migrated dev DB**

```bash
npx drizzle-kit check
```

Expected: no errors reporting schema/DB divergence for `user_sessions`, `login_rate_limits`, or `ops_events`.

- [ ] **Step 2: Dry-run `drizzle-kit push` and read the prompt carefully**

```bash
npx drizzle-kit push
```

Expected: the interactive prompt does **not** list any of the three bootstrap tables as "unknown" / "drop". If it proposes dropping any of them, **abort with Ctrl+C** — a column mismatch is present and Tasks 4-6 need review. Fix the mismatch (likely candidates: `json` vs `jsonb`, `timestamptz` precision, index name casing), rerun the parity test, then rerun this step.

- [ ] **Step 3: (No commit — validation only)**

---

## Task 8: Runbook update

**Files:**
- Modify: `docs/BACKUP-RESTORE.md`

- [ ] **Step 1: Append at the bottom of `docs/BACKUP-RESTORE.md`**

````markdown
---

## Do not drop the bootstrap tables

Three tables live in both `shared/schema.ts` and the app's startup SQL
(`server/auth.ts`, `server/rate-limiter.ts`, `server/ops-events.ts`):

- `user_sessions` — Express session store (connect-pg-simple)
- `login_rate_limits` — per-IP/username login throttle
- `ops_events` — security / observability event log

If `npx drizzle-kit push` ever proposes **dropping** any of these, **answer no**.
That only happens when the Drizzle definitions have drifted from the DB; fix
the definitions first. To re-create all three on a fresh DB without starting
the server, apply the consolidated migration:

```bash
npx tsx script/migrate-bootstrap-tables.ts
```

The migration is idempotent — safe to run against an already-populated
database; every statement is guarded by `IF NOT EXISTS` or a `DO $$` block.
````

- [ ] **Step 2: Commit**

```bash
git add docs/BACKUP-RESTORE.md
git commit -m "docs: warn against drizzle-kit push dropping bootstrap tables"
```

---

## Task 9: State and changelog

**Files:**
- Modify: `STATE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Append to `STATE.md` under today's session notes**

```markdown
### 2026-04-17 — Bootstrap tables reconciled
- Added Drizzle definitions for `user_sessions`, `login_rate_limits`, `ops_events`
  in `shared/schema.ts`.
- New idempotent migration `migrations/add-bootstrap-tables.sql` plus runner
  `script/migrate-bootstrap-tables.ts`.
- Parity test `server/tests/bootstrap-tables-parity.test.ts` locks column/index/PK
  shape against future drift.
- Startup bootstrap SQL in `server/auth.ts`, `server/rate-limiter.ts`, and
  `server/ops-events.ts` retained as belt-and-suspenders for fresh containers.
- `drizzle-kit push` no longer proposes dropping these three tables.
```

- [ ] **Step 2: Add a one-line entry to `CHANGELOG.md` under the current unreleased section**

```markdown
- chore(db): reconcile bootstrap tables (user_sessions, login_rate_limits, ops_events) into Drizzle schema with idempotent migration
```

- [ ] **Step 3: Commit**

```bash
git add STATE.md CHANGELOG.md
git commit -m "docs: log bootstrap-tables reconciliation in STATE and CHANGELOG"
```

---

## Done When

- [ ] `shared/schema.ts` exports `userSessions`, `loginRateLimits`, `opsEvents` with matching `$inferSelect` types.
- [ ] `migrations/add-bootstrap-tables.sql` exists, is idempotent, applies cleanly twice in a row.
- [ ] `script/migrate-bootstrap-tables.ts` runs end-to-end.
- [ ] `server/tests/bootstrap-tables-parity.test.ts` passes and asserts both DB shape and Drizzle exports.
- [ ] `npm run check` and `npm test` both green.
- [ ] `npx drizzle-kit check` reports no divergence for the three tables.
- [ ] `npx drizzle-kit push` dry-run does not propose dropping any of the three tables.
- [ ] `docs/BACKUP-RESTORE.md` has the "do not drop" runbook section.
- [ ] `STATE.md` and `CHANGELOG.md` entries added.

---

## Self-Review Notes

- **Spec coverage:** spec asked for Option A (schema + reconciliation migration), keeping bootstrap SQL as safeguard, and validating with `drizzle-kit check`. Covered by Tasks 1-7. Task 8 also lands the "lighter" runbook note from Option B as cheap insurance.
- **Placeholder scan:** every SQL/TS snippet is concrete and copy-paste ready.
- **Type consistency:** `sess` column is PG `json` per `server/auth.ts:62`, mapped via Drizzle `json()` — not `jsonb()`. `ops_events.payload` is `jsonb`. `timestamptz` columns use `{ withTimezone: true }`; `user_sessions.expire` is `timestamp(6)` without tz, mapped via `{ precision: 6 }`. Index name `IDX_user_sessions_expire` is quoted in SQL to preserve case.
- **FK safety:** `opsEvents.userId` references `users.id` with `onDelete: "set null"` — matches the raw SQL exactly.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-bootstrap-tables-schema-reconcile.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
