import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import pg from "pg";

type RoleMode = { auth: "unauth" } | { auth: "viewer" | "editor" | "admin" };

// Date helpers — all relative to today to stay deterministic
function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

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
        code TEXT,
        name TEXT,
        units INTEGER DEFAULT 1,
        category TEXT,
        responsible TEXT,
        condition TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        responsible TEXT,
        item_id INTEGER,
        file_url TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        document_type TEXT,
        expires_at DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id INTEGER
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

// Seed helpers
async function seedResponsible(pool: pg.Pool, name: string): Promise<number> {
  const code = `CMP-${name.replace(/\s/g, "_")}-${Date.now()}`;
  const res = await pool.query<{ id: number }>(
    `INSERT INTO inventory_items (code, name, units, responsible) VALUES ($1, $2, 1, $3) RETURNING id`,
    [code, `Item for ${name}`, name]
  );
  return res.rows[0]!.id;
}

async function seedDoc(pool: pg.Pool, opts: {
  responsible: string;
  documentType: string;
  expiresAt?: string | null;
}): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO employee_documents (responsible, file_url, original_name, document_type, expires_at)
     VALUES ($1, '/uploads/documents/test.pdf', 'test.pdf', $2, $3) RETURNING id`,
    [opts.responsible, opts.documentType, opts.expiresAt ?? null]
  );
  return res.rows[0]!.id;
}

// ---- Tests ----

test("compliance: missing bucket — no doc for (responsible, docType)", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpMissing-${Date.now()}`;
  await seedResponsible(pool, responsible);

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible && e.documentType === "Contract");
    assert.ok(entry, "Entry for missing responsible should be present");
    assert.equal(entry.bucket, "missing");
    assert.equal(entry.documentId, null);
    assert.equal(entry.expiresAt, null);
    assert.equal(entry.daysUntilExpiry, null);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: due soon bucket — expires within window", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpDueSoon-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: dateOffset(15) });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.ok(entry);
    assert.equal(entry.bucket, "dueSoon");
    assert.ok(entry.daysUntilExpiry >= 0, "Days until expiry should be non-negative");
    assert.ok(entry.daysUntilExpiry <= 30, "Days until expiry should be within window");
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: overdue bucket — expired recently", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpOverdue-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: dateOffset(-10) });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.ok(entry);
    assert.equal(entry.bucket, "overdue");
    assert.ok(entry.daysUntilExpiry < 0);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: critical bucket — expired beyond threshold", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpCritical-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: dateOffset(-45) });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.ok(entry);
    assert.equal(entry.bucket, "critical");
    assert.ok(entry.daysUntilExpiry <= -30);
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: current doc (no expiry) — omitted from queue", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpNoExpiry-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: null });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.equal(entry, undefined, "No-expiry doc should not appear in queue");
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: far-future expiry — omitted from queue", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpFuture-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: dateOffset(90) });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.equal(entry, undefined, "Far-future doc should not appear in queue");
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: latest-wins — older overdue doc superseded by newer current doc", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpLatest-${Date.now()}`;
  await seedResponsible(pool, responsible);
  // Insert older overdue doc first (lower id / earlier datetime)
  await pool.query(
    `INSERT INTO employee_documents (responsible, file_url, original_name, document_type, expires_at, created_at)
     VALUES ($1, '/uploads/documents/old.pdf', 'old.pdf', 'Contract', $2, NOW() - interval '1 hour')`,
    [responsible, dateOffset(-10)]
  );
  // Insert newer doc with far-future expiry (should win)
  await pool.query(
    `INSERT INTO employee_documents (responsible, file_url, original_name, document_type, expires_at, created_at)
     VALUES ($1, '/uploads/documents/new.pdf', 'new.pdf', 'Contract', $2, NOW())`,
    [responsible, dateOffset(90)]
  );

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues?documentTypes=Contract`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entry = data.entries.find((e: any) => e.responsible === responsible);
    assert.equal(entry, undefined, "Latest doc (far-future) should suppress older overdue doc");
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});

test("compliance: viewer can GET queues (200)", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(Array.isArray(data.entries));
    assert.ok(typeof data.counts === "object");
    assert.ok(typeof data.asOf === "string");
  } finally {
    httpServer.close();
  }
});

test("compliance: unauthenticated returns 401", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "unauth" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues`, { credentials: "include" });
    assert.equal(res.status, 401);
  } finally {
    httpServer.close();
  }
});

test("compliance: viewer cannot upload documents (403)", async () => {
  const { baseUrl, httpServer } = await startTestServer({ auth: "viewer" });
  try {
    const res = await fetch(`${baseUrl}/api/employees/documents`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(res.status, 403);
  } finally {
    httpServer.close();
  }
});

test("compliance: counts match entry list cardinality", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://inventario:inventario@127.0.0.1:5432/inventario" });
  const responsible = `CmpCounts-${Date.now()}`;
  await seedResponsible(pool, responsible);
  await seedDoc(pool, { responsible, documentType: "Contract", expiresAt: dateOffset(-5) });

  const { baseUrl, httpServer } = await startTestServer({ auth: "admin" });
  try {
    const res = await fetch(`${baseUrl}/api/compliance/queues`, { credentials: "include" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const entries: any[] = data.entries;
    const missing = entries.filter((e: any) => e.bucket === "missing").length;
    const dueSoon = entries.filter((e: any) => e.bucket === "dueSoon").length;
    const overdue = entries.filter((e: any) => e.bucket === "overdue").length;
    const critical = entries.filter((e: any) => e.bucket === "critical").length;
    assert.equal(data.counts.missing, missing, "missing count mismatch");
    assert.equal(data.counts.dueSoon, dueSoon, "dueSoon count mismatch");
    assert.equal(data.counts.overdue, overdue, "overdue count mismatch");
    assert.equal(data.counts.critical, critical, "critical count mismatch");
  } finally {
    httpServer.close();
    await pool.query(`DELETE FROM employee_documents WHERE responsible = $1`, [responsible]);
    await pool.query(`DELETE FROM inventory_items WHERE responsible = $1`, [responsible]);
    await pool.end();
  }
});
