import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function ensureTestSchema(): Promise<void> {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
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
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT,
        units INTEGER DEFAULT 1,
        category TEXT,
        responsible TEXT,
        condition TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        user_id INTEGER,
        transaction_type TEXT,
        quantity INTEGER,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_schedules (
        id serial PRIMARY KEY,
        item_id integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        schedule_type text NOT NULL,
        title text NOT NULL,
        interval_days integer NOT NULL,
        start_date date NOT NULL,
        next_due_at date NOT NULL,
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS maintenance_schedules_item_type_active_idx
        ON maintenance_schedules (item_id, schedule_type)
        WHERE active = true;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_events (
        id serial PRIMARY KEY,
        schedule_id integer NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
        performed_at date NOT NULL,
        condition_result text,
        notes text NOT NULL,
        evidence_url text,
        completed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (1, 'test-user', 'test-hash', 'admin', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    await pool.end();
  }
}

async function startTestServer(roleMode: RoleMode): Promise<{ baseUrl: string; httpServer: HttpServer }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

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

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  await ensureTestSchema();
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

test("maintenance: create schedule creates row and logs history", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  
  const code = `MTN1-${Date.now()}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Maintenance Test 1', 1, 'Tools', 'Tech Dept')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/${itemId}/maintenance/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({
        scheduleType: "maintenance",
        title: "Test Schedule",
        intervalDays: 90,
        startDate: "2026-01-01"
      }),
    });
    assert.equal(resp.status, 201);
    const schedule = (await resp.json()) as any;
    assert.equal(schedule.title, "Test Schedule");
    assert.equal(schedule.intervalDays, 90);
    assert.equal(schedule.nextDueAt.split("T")[0], "2026-01-01");
  } finally {
    httpServer.close();
  }

  const hist = await pool.query<{ transaction_type: string }>(
    `SELECT transaction_type FROM inventory_history WHERE product_id = $1 AND transaction_type = 'MAINTENANCE_SCHEDULED' ORDER BY id DESC LIMIT 1`,
    [itemId],
  );
  assert.equal(hist.rows[0]?.transaction_type, "MAINTENANCE_SCHEDULED");

  await pool.query(`DELETE FROM maintenance_schedules WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("maintenance: viewer cannot complete schedule (403)", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  
  const code = `MTN2-${Date.now()}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Maintenance Test 2', 1, 'Tools', 'Tech Dept')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/maintenance/999/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ performedAt: "2026-06-01", notes: "Test" }),
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("maintenance: editor can complete schedule and next due is calculated", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  
  const code = `MTN3-${Date.now()}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Maintenance Test 3', 1, 'Tools', 'Tech Dept')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  // Create a schedule first
  const schedIns = await pool.query<{ id: number }>(
    `INSERT INTO maintenance_schedules (item_id, schedule_type, title, interval_days, start_date, next_due_at)
     VALUES ($1, 'maintenance', 'Complete Me', 30, '2026-01-01', '2026-01-01')
     RETURNING id`,
    [itemId],
  );
  const scheduleId = schedIns.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/maintenance/${scheduleId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({
        performedAt: "2026-02-01",
        conditionResult: "Good",
        notes: "Test completion"
      }),
    });
    assert.equal(resp.status, 200);
    const data = (await resp.json()) as any;
    assert.equal(data.event.notes, "Test completion");
    
    // Check next due date update (Feb 1 + 30 days = Mar 3)
    // 2026-02-01 + 30 days. Feb has 28 days.
    // Feb 1 to Feb 28 is 27 days. 3 more days in March = March 3.
    assert.equal(data.schedule.nextDueAt.split("T")[0], "2026-03-03");

    // Verify history record
    const hist = await pool.query<{ transaction_type: string }>(
      `SELECT transaction_type FROM inventory_history WHERE product_id = $1 AND transaction_type = 'MAINTENANCE_COMPLETED' ORDER BY id DESC LIMIT 1`,
      [itemId],
    );
    assert.equal(hist.rows[0]?.transaction_type, "MAINTENANCE_COMPLETED");
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM maintenance_events WHERE schedule_id = $1`, [scheduleId]);
  await pool.query(`DELETE FROM maintenance_schedules WHERE id = $1`, [scheduleId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});
