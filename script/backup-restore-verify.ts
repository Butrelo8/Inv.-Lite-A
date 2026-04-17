/**
 * Automated restore verification:
 * - Locates latest backup artifact
 * - Restores database.dump into an isolated temporary database
 * - Runs integrity checks
 * - Emits ops event pass/fail with report payload
 *
 * Run: npm run backup:verify-restore
 */
import "dotenv/config";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawBackupDir = process.env.BACKUP_DIR?.trim();
const BACKUP_DIR = rawBackupDir
  ? path.isAbsolute(rawBackupDir)
    ? rawBackupDir
    : path.resolve(REPO_ROOT, rawBackupDir)
  : path.join(REPO_ROOT, "backups");
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER?.trim() || undefined;
const SKIP_UPLOADS_CHECK = process.env.BACKUP_VERIFY_SKIP_UPLOADS_CHECK === "true";

type DbConn = { host: string; port: string; user: string; password: string; database: string };
type VerifyCheck = { name: string; ok: boolean; details: string };
type VerifyReport = {
  ok: boolean;
  artifactPath: string;
  restoredDb: string;
  durationSec: number;
  checks: VerifyCheck[];
  startedAt: string;
  finishedAt: string;
};

function parseDatabaseUrl(url: string): DbConn {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port || "5432",
      user: decodeURIComponent(parsed.username || "postgres"),
      password: decodeURIComponent(parsed.password || ""),
      database: (parsed.pathname || "").replace(/^\//, "") || "postgres",
    };
  } catch {
    throw new Error("Invalid DATABASE_URL format");
  }
}

function resolve7z(): string {
  const configured = process.env.BACKUP_7Z_PATH;
  if (configured && fs.existsSync(configured)) return configured;
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "7-Zip", "7z.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "7-Zip", "7z.exe"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return "7z";
}

function resolvePgRestore(): string {
  const configured = process.env.PG_RESTORE_PATH ?? "pg_restore";
  if (configured !== "pg_restore" && fs.existsSync(configured)) return configured;
  if (process.platform === "win32") {
    const pgRoot = path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PostgreSQL");
    if (fs.existsSync(pgRoot)) {
      const versions = fs.readdirSync(pgRoot).sort().reverse();
      for (const v of versions) {
        const exe = path.join(pgRoot, v, "bin", "pg_restore.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return configured;
}

function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    proc.once("error", reject);
    proc.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim() || "no stderr"}`));
    });
  });
}

function latestBackupArtifact(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    throw new Error(`Backup directory does not exist: ${BACKUP_DIR}`);
  }
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.name.startsWith("inventario_"))
    .filter((e) => e.isDirectory() || e.name.endsWith(".7z") || e.name.endsWith(".tar.gz"))
    .map((e) => {
      const full = path.join(BACKUP_DIR, e.name);
      const stat = fs.statSync(full);
      return { full, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates.length) {
    throw new Error(`No backup artifacts found in ${BACKUP_DIR}`);
  }
  return candidates[0].full;
}

function findDumpDir(rootDir: string): string {
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop()!;
    const dump = path.join(current, "database.dump");
    if (fs.existsSync(dump) && fs.statSync(dump).isFile()) return current;
    const children = fs.readdirSync(current, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory()) continue;
      stack.push(path.join(current, child.name));
    }
  }
  throw new Error(`Could not locate database.dump under: ${rootDir}`);
}

async function materializeArtifact(artifactPath: string): Promise<{ dumpPath: string; rootPath: string; cleanupPath: string | null }> {
  const stat = fs.statSync(artifactPath);
  if (stat.isDirectory()) {
    return {
      dumpPath: path.join(artifactPath, "database.dump"),
      rootPath: artifactPath,
      cleanupPath: null,
    };
  }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "inventario-restore-verify-"));
  if (artifactPath.endsWith(".7z")) {
    const outArg = `-o${tmpRoot}`;
    await runCommand(resolve7z(), ["x", artifactPath, outArg, "-y"]);
  } else if (artifactPath.endsWith(".tar.gz")) {
    await runCommand("tar", ["-xzf", artifactPath, "-C", tmpRoot]);
  } else {
    throw new Error(`Unsupported artifact format: ${artifactPath}`);
  }
  const dumpDir = findDumpDir(tmpRoot);
  return {
    dumpPath: path.join(dumpDir, "database.dump"),
    rootPath: dumpDir,
    cleanupPath: tmpRoot,
  };
}

async function createTempDatabase(adminPool: pg.Pool, dbName: string): Promise<void> {
  await adminPool.query(`create database "${dbName.replace(/"/g, "\"\"")}"`);
}

async function dropTempDatabase(adminPool: pg.Pool, dbName: string): Promise<void> {
  await adminPool.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`drop database if exists "${dbName.replace(/"/g, "\"\"")}"`);
}

async function restoreDump(db: DbConn, tempDbName: string, dumpPath: string): Promise<void> {
  if (POSTGRES_CONTAINER) {
    const inContainerDump = `/tmp/restore_verify_${Date.now()}_${randomBytes(3).toString("hex")}.dump`;
    try {
      await runCommand("docker", ["cp", dumpPath, `${POSTGRES_CONTAINER}:${inContainerDump}`]);
      await runCommand(
        "docker",
        [
          "exec",
          "-e",
          "PGPASSWORD",
          POSTGRES_CONTAINER,
          "pg_restore",
          "-U",
          db.user,
          "-d",
          tempDbName,
          "--no-owner",
          "--no-acl",
          inContainerDump,
        ],
        { env: { ...process.env, PGPASSWORD: db.password } },
      );
    } finally {
      await runCommand("docker", ["exec", POSTGRES_CONTAINER, "rm", "-f", inContainerDump]).catch(() => undefined);
    }
    return;
  }

  await runCommand(
    resolvePgRestore(),
    [
      "-h",
      db.host,
      "-p",
      db.port,
      "-U",
      db.user,
      "-d",
      tempDbName,
      "--no-owner",
      "--no-acl",
      dumpPath,
    ],
    { env: { ...process.env, PGPASSWORD: db.password } },
  );
}

async function runIntegrityChecks(db: DbConn, tempDbName: string, artifactRoot: string): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const verifyPool = new Pool({
    host: db.host,
    port: Number(db.port),
    user: db.user,
    password: db.password,
    database: tempDbName,
  });
  try {
    const requiredTables = ["inventory_items", "inventory_history", "companies", "users", "inventory_attachments"];
    const tableRows = await verifyPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [requiredTables],
    );
    const found = new Set(tableRows.rows.map((r) => r.tablename));
    const missing = requiredTables.filter((t) => !found.has(t));
    checks.push({
      name: "required_tables_exist",
      ok: missing.length === 0,
      details: missing.length ? `Missing tables: ${missing.join(", ")}` : "All required tables found",
    });

    const items = await verifyPool.query<{ count: string }>(`select count(*)::text as count from inventory_items`);
    const itemCount = Number(items.rows[0]?.count ?? 0);
    checks.push({
      name: "inventory_items_count_readable",
      ok: Number.isFinite(itemCount),
      details: `inventory_items=${itemCount}`,
    });

    const orphanAttachments = await verifyPool.query<{ count: string }>(
      `select count(*)::text as count
       from inventory_attachments a
       left join inventory_items i on i.id = a.item_id
       where i.id is null`,
    );
    const orphanAttCount = Number(orphanAttachments.rows[0]?.count ?? 0);
    checks.push({
      name: "orphan_inventory_attachments",
      ok: orphanAttCount === 0,
      details: `orphans=${orphanAttCount}`,
    });

    const orphanNotes = await verifyPool.query<{ count: string }>(
      `select count(*)::text as count
       from shared_notes n
       left join inventory_items i on i.id = n.item_id
       where i.id is null`,
    );
    const orphanNotesCount = Number(orphanNotes.rows[0]?.count ?? 0);
    checks.push({
      name: "orphan_shared_notes",
      ok: orphanNotesCount === 0,
      details: `orphans=${orphanNotesCount}`,
    });

    if (!SKIP_UPLOADS_CHECK) {
      const uploadsPath = path.join(artifactRoot, "uploads");
      checks.push({
        name: "uploads_snapshot_present",
        ok: fs.existsSync(uploadsPath),
        details: fs.existsSync(uploadsPath) ? "uploads/ directory found in artifact" : "uploads/ directory missing in artifact",
      });
    }
  } finally {
    await verifyPool.end().catch(() => undefined);
  }
  return checks;
}

async function emitRestoreVerifyEvent(dbUrl: string, report: VerifyReport): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });
  try {
    await pool.query(
      `insert into ops_events (event_type, severity, source, environment, payload, created_at)
       values ($1, $2, $3, $4, $5::jsonb, now())`,
      [
        report.ok ? "job.backup_restore_verify_success" : "job.backup_restore_verify_failure",
        report.ok ? "info" : "critical",
        "backup-restore-verify-script",
        process.env.NODE_ENV || "development",
        JSON.stringify(report),
      ],
    );
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code !== "42P01") {
      console.error("Failed to emit restore verification event:", err instanceof Error ? err.message : err);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Add it to .env");
    process.exit(1);
  }
  const startedAt = new Date();
  const db = parseDatabaseUrl(dbUrl);
  const adminPool = new Pool({
    host: db.host,
    port: Number(db.port),
    user: db.user,
    password: db.password,
    database: "postgres",
  });
  const tempDbName = `inventario_restore_verify_${Date.now()}_${randomBytes(2).toString("hex")}`;

  let artifactPath = "";
  let cleanupPath: string | null = null;
  let report: VerifyReport | null = null;

  try {
    artifactPath = latestBackupArtifact();
    console.log(`Using artifact: ${artifactPath}`);

    const materialized = await materializeArtifact(artifactPath);
    cleanupPath = materialized.cleanupPath;

    await runCommand(resolvePgRestore(), ["--list", materialized.dumpPath]);
    await createTempDatabase(adminPool, tempDbName);
    await restoreDump(db, tempDbName, materialized.dumpPath);
    const checks = await runIntegrityChecks(db, tempDbName, materialized.rootPath);
    const ok = checks.every((c) => c.ok);
    const finishedAt = new Date();
    report = {
      ok,
      artifactPath,
      restoredDb: tempDbName,
      durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      checks,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };

    const reportPath = path.join(BACKUP_DIR, `restore-verify-report-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Restore verification report: ${reportPath}`);
    await emitRestoreVerifyEvent(dbUrl, report);

    if (!ok) {
      console.error("Restore verification failed. See report for failed checks.");
      process.exit(1);
    }
    console.log("Restore verification passed.");
  } catch (err) {
    const finishedAt = new Date();
    const failReport: VerifyReport = {
      ok: false,
      artifactPath: artifactPath || "(not resolved)",
      restoredDb: tempDbName,
      durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      checks: [
        {
          name: "job_execution",
          ok: false,
          details: err instanceof Error ? err.message : String(err),
        },
      ],
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
    await emitRestoreVerifyEvent(dbUrl, failReport);
    console.error("Restore verification failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await dropTempDatabase(adminPool, tempDbName).catch(() => undefined);
    await adminPool.end().catch(() => undefined);
    if (cleanupPath && fs.existsSync(cleanupPath)) {
      fs.rmSync(cleanupPath, { recursive: true, force: true });
    }
  }
}

main();

