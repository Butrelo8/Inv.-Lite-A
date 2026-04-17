import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

async function ensureAssignmentWorkflowSchema(): Promise<void> {
  const url =
    process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
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
      CREATE TABLE IF NOT EXISTS inventory_bulk_undo (
        id serial PRIMARY KEY,
        token text NOT NULL UNIQUE,
        action_type text NOT NULL,
        payload jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_assignments (
        id serial PRIMARY KEY,
        item_id integer NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        assignee text NOT NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        condition_at_assign text,
        notes text,
        assigned_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        returned_at timestamptz,
        return_condition text,
        return_notes text,
        returned_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS inventory_assignments_active_item_idx
        ON inventory_assignments (item_id)
        WHERE returned_at IS NULL;
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

  await ensureAssignmentWorkflowSchema();
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

test("assignment: assign updates responsible and writes ASSIGN history", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG1-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test Item', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "Juan Pérez", condition: "Good", notes: "Custodia formal" }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { item: { responsible: string | null } };
    assert.equal(body.item.responsible, "Juan Pérez");
  } finally {
    httpServer.close();
  }

  const hist = await pool.query<{ transaction_type: string }>(
    `SELECT transaction_type FROM inventory_history WHERE product_id = $1 AND transaction_type = 'ASSIGN' ORDER BY id DESC LIMIT 1`,
    [itemId],
  );
  assert.equal(hist.rows[0]?.transaction_type, "ASSIGN");
  await pool.query(`DELETE FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("assignment: second assign without transfer returns 409", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG2-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test 2', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    const r1 = await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "Ana" }),
    });
    assert.equal(r1.status, 200);
    const r2 = await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "Bob" }),
    });
    assert.equal(r2.status, 409);
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("assignment: transfer closes active and creates new assignment", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG3-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test 3', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "First" }),
    });
    const r2 = await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "Second", transfer: true }),
    });
    assert.equal(r2.status, 200);
    const body = (await r2.json()) as { item: { responsible: string | null } };
    assert.equal(body.item.responsible, "Second");
  } finally {
    httpServer.close();
  }

  const rows = await pool.query(`SELECT count(*)::int AS c FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  assert.ok(Number(rows.rows[0]?.c) >= 2);
  await pool.query(`DELETE FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("assignment: return sets responsible to Sin asignar", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG4-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test 4', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "editor" });
  try {
    await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "Holder" }),
    });
    const r2 = await fetch(`${baseUrl}/api/inventory/${itemId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ condition: "Good", notes: "OK" }),
    });
    assert.equal(r2.status, 200);
    const body = (await r2.json()) as { item: { responsible: string | null } };
    assert.equal(body.item.responsible, "Sin asignar");
    const r3 = await fetch(`${baseUrl}/api/inventory/${itemId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({}),
    });
    assert.equal(r3.status, 409);
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("assignment: viewer cannot assign (403)", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG5-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test 5', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "X" }),
    });
    assert.equal(resp.status, 403);
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});

test("assignment: unauthenticated assign returns 401", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "unauth" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/1/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee: "X" }),
    });
    assert.equal(resp.status, 401);
  } finally {
    httpServer.close();
  }
});

test("assignment: GET assignments returns list for viewer", async () => {
  const url = process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario";
  const pool = new pg.Pool({ connectionString: url });
  const code = `ASG6-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, category, responsible)
     VALUES ($1, 'Assignment Test 6', 1, 'Test', 'Equipo de trabajo')
     RETURNING id`,
    [code],
  );
  const itemId = ins.rows[0]!.id;

  const { baseUrl: editorUrl, httpServer: s1 } = await startTestServer({ auth: "editor" });
  try {
    await fetch(`${editorUrl}/api/inventory/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ assignee: "ListTest" }),
    });
  } finally {
    s1.close();
  }

  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const resp = await fetch(`${baseUrl}/api/inventory/${itemId}/assignments`, {
      credentials: "include",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(resp.status, 200);
    const data = (await resp.json()) as { assignments: { assignee: string }[] };
    assert.ok(Array.isArray(data.assignments));
    assert.ok(data.assignments.length >= 1);
    assert.equal(data.assignments[0]?.assignee, "ListTest");
  } finally {
    httpServer.close();
  }

  await pool.query(`DELETE FROM inventory_assignments WHERE item_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_history WHERE product_id = $1`, [itemId]);
  await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await pool.end();
});
