/**
 * Automated backup: PostgreSQL dump + uploads folder.
 * Run: npm run backup
 *
 * Archive layout: inventario_<timestamp>/database.dump (custom format) + uploads/
 * Restore: docs/BACKUP-RESTORE.md (use pg_restore, not plain SQL).
 *
 * For PostgreSQL in Docker: set POSTGRES_CONTAINER in .env (e.g. postgres-16)
 * For local PostgreSQL: pg_dump must be in PATH, or set PG_DUMP_PATH
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

/** Directory containing package.json (stable even if the shell cwd is elsewhere). */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawBackupDir = process.env.BACKUP_DIR?.trim();
const BACKUP_DIR = rawBackupDir
  ? path.isAbsolute(rawBackupDir)
    ? rawBackupDir
    : path.resolve(REPO_ROOT, rawBackupDir)
  : path.join(REPO_ROOT, "backups");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? "7", 10);
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER?.trim() || undefined;
const SKIP_UPLOADS = process.env.BACKUP_SKIP_UPLOADS === "true";
const { Pool } = pg;

function resolvePgDump(): string {
  const configured = process.env.PG_DUMP_PATH ?? "pg_dump";
  if (configured !== "pg_dump" && fs.existsSync(configured)) return configured;
  if (process.platform === "win32") {
    const pgRoot = path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PostgreSQL");
    if (fs.existsSync(pgRoot)) {
      const versions = fs.readdirSync(pgRoot).sort().reverse();
      for (const v of versions) {
        const exe = path.join(pgRoot, v, "bin", "pg_dump.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return configured;
}
const PG_DUMP_PATH = resolvePgDump();

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

function parseDatabaseUrl(url: string): { host: string; port: string; user: string; password: string; database: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port || "5432",
      user: decodeURIComponent(parsed.username || "postgres"),
      password: decodeURIComponent(parsed.password || ""),
      database: (parsed.pathname || "").replace(/^\//, "") || "inventario",
    };
  } catch {
    throw new Error("Invalid DATABASE_URL format");
  }
}

function runPgDump(outputPath: string, db: ReturnType<typeof parseDatabaseUrl>): Promise<void> {
  if (POSTGRES_CONTAINER) {
    return runPgDumpDocker(outputPath, db);
  }
  return new Promise((resolve, reject) => {
    const args = [
      "-h", db.host,
      "-p", db.port,
      "-U", db.user,
      "-F", "c",
      "-f", outputPath,
      db.database,
    ];
    const env = { ...process.env, PGPASSWORD: db.password };
    const proc = spawn(PG_DUMP_PATH, args, { env, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr?.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited ${code}: ${stderr.trim() || "Check that pg_dump is in PATH (PostgreSQL bin)"}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

function dockerRun(
  args: string[],
  options: { passDbPassword?: boolean; password?: string } = {},
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env =
      options.passDbPassword && options.password !== undefined
        ? { ...process.env, PGPASSWORD: options.password }
        : { ...process.env };
    const proc = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    proc.once("error", reject);
    proc.once("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/**
 * Dump via a temp file inside the container + docker cp.
 * On Windows, `docker exec ... pg_dump -f -` often yields an empty stdout stream even when pg_dump succeeds.
 */
async function runPgDumpDocker(outputPath: string, db: ReturnType<typeof parseDatabaseUrl>): Promise<void> {
  const c = POSTGRES_CONTAINER!;
  const tmpPath = `/tmp/inventario_pg_${Date.now()}_${randomBytes(4).toString("hex")}.dump`;

  const dumpArgs = [
    "exec",
    "-e",
    "PGPASSWORD",
    c,
    "pg_dump",
    "-U",
    db.user,
    "-F",
    "c",
    "-f",
    tmpPath,
    db.database,
  ];
  let { code, stderr } = await dockerRun(dumpArgs, { passDbPassword: true, password: db.password });
  if (code !== 0) {
    const hint =
      stderr.trim() ||
      `Check POSTGRES_CONTAINER matches a running Postgres container (e.g. docker ps --format "{{.Names}}").`;
    throw new Error(`docker exec pg_dump exited ${code}: ${hint}`);
  }

  ({ code, stderr } = await dockerRun(["cp", `${c}:${tmpPath}`, outputPath]));
  if (code !== 0) {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      /* ignore */
    }
    await dockerRun(["exec", c, "rm", "-f", tmpPath]);
    throw new Error(`docker cp failed (${code}): ${stderr.trim() || "Could not copy dump from container."}`);
  }

  await dockerRun(["exec", c, "rm", "-f", tmpPath]);

  const size = fs.statSync(outputPath).size;
  if (size === 0) {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      /* ignore */
    }
    throw new Error(
      `pg_dump file was empty after copy. ${stderr.trim() || "Verify DATABASE_URL credentials and database name."}`,
    );
  }
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function compressBackup(backupPath: string): Promise<{ ok: boolean; ext: string }> {
  const baseName = path.basename(backupPath);

  const try7z = (): Promise<{ ok: boolean; ext: string }> =>
    new Promise((resolve) => {
      const archivePath = backupPath + ".7z";
      const proc = spawn(resolve7z(), ["a", "-t7z", "-mx=9", archivePath, baseName], {
        cwd: BACKUP_DIR,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      proc.stderr?.on("data", (c) => { stderr += c.toString(); });
      proc.on("close", (code) => {
        if (code === 0) {
          fs.rmSync(backupPath, { recursive: true, force: true });
          resolve({ ok: true, ext: ".7z" });
        } else resolve({ ok: false, ext: "" });
      });
      proc.on("error", () => resolve({ ok: false, ext: "" }));
    });

  const tryTarGz = (): Promise<{ ok: boolean; ext: string }> =>
    new Promise((resolve) => {
      const archivePath = backupPath + ".tar.gz";
      const proc = spawn("tar", ["-czf", archivePath, "-C", BACKUP_DIR, baseName], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      proc.stderr?.on("data", (c) => { stderr += c.toString(); });
      proc.on("close", (code) => {
        if (code === 0) {
          fs.rmSync(backupPath, { recursive: true, force: true });
          resolve({ ok: true, ext: ".tar.gz" });
        } else {
          console.warn("  Compression failed:", stderr.trim() || code);
          resolve({ ok: false, ext: "" });
        }
      });
      proc.on("error", () => resolve({ ok: false, ext: "" }));
    });

  return try7z().then((r) => (r.ok ? r : tryTarGz()));
}

function pruneOldBackups(): void {
  if (RETENTION_DAYS < 1) return;
  if (!fs.existsSync(BACKUP_DIR)) return;
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    const fullPath = path.join(BACKUP_DIR, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs >= cutoff) continue;
    if (entry.isDirectory() || entry.name.endsWith(".tar.gz") || entry.name.endsWith(".7z")) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  Pruned old backup: ${entry.name}`);
    }
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Add it to .env");
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `inventario_${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  console.log(`Creating backup: ${backupPath}`);

  fs.mkdirSync(backupPath, { recursive: true });
  const startedAt = Date.now();

  const emitBackupEvent = async (
    eventType: "job.backup_success" | "job.backup_failure",
    severity: "info" | "critical",
    payload: Record<string, unknown>,
  ) => {
    if (!dbUrl) return;
    const pool = new Pool({ connectionString: dbUrl });
    try {
      await pool.query(
        `insert into ops_events (event_type, severity, source, environment, payload, created_at)
         values ($1, $2, $3, $4, $5::jsonb, now())`,
        [eventType, severity, "backup-script", process.env.NODE_ENV || "development", JSON.stringify(payload)]
      );
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "42P01") {
        return;
      }
      console.error("Failed to emit backup event:", err instanceof Error ? err.message : err);
    } finally {
      await pool.end().catch(() => undefined);
    }
  };

  try {
    const db = parseDatabaseUrl(dbUrl);
    const dumpPath = path.join(backupPath, "database.dump");
    console.log("  Dumping database...");
    await runPgDump(dumpPath, db);
    console.log("  Database dump OK");

    const uploadsSrc = path.join(REPO_ROOT, "uploads");
    const uploadsDest = path.join(backupPath, "uploads");
    if (!SKIP_UPLOADS && fs.existsSync(uploadsSrc)) {
      console.log("  Copying uploads...");
      copyDirRecursive(uploadsSrc, uploadsDest);
      console.log("  Uploads OK");
    } else if (SKIP_UPLOADS) {
      console.log("  Uploads skipped (BACKUP_SKIP_UPLOADS=true)");
    } else {
      console.log("  No uploads folder (skipped)");
    }

    const compress = process.env.BACKUP_COMPRESS !== "false";
    if (compress) {
      console.log("  Compressing...");
      const { ok, ext } = await compressBackup(backupPath);
      if (ok) {
        console.log(`\n✓ Backup saved (compressed) to ${backupPath}${ext}`);
        await emitBackupEvent("job.backup_success", "info", {
          backupPath: `${backupPath}${ext}`,
          compressed: true,
          uploadsIncluded: !SKIP_UPLOADS,
          durationSec: Math.round((Date.now() - startedAt) / 1000),
        });
      } else {
        console.log(`\n✓ Backup saved to ${backupPath}`);
        await emitBackupEvent("job.backup_success", "info", {
          backupPath,
          compressed: false,
          uploadsIncluded: !SKIP_UPLOADS,
          durationSec: Math.round((Date.now() - startedAt) / 1000),
        });
      }
    } else {
      console.log(`\n✓ Backup saved to ${backupPath}`);
      await emitBackupEvent("job.backup_success", "info", {
        backupPath,
        compressed: false,
        uploadsIncluded: !SKIP_UPLOADS,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      });
    }
    pruneOldBackups();
  } catch (err) {
    console.error("Backup failed:", err instanceof Error ? err.message : err);
    await emitBackupEvent("job.backup_failure", "critical", {
      backupPath,
      error: err instanceof Error ? err.message : String(err),
      durationSec: Math.round((Date.now() - startedAt) / 1000),
    });
    fs.rmSync(backupPath, { recursive: true, force: true });
    process.exit(1);
  }

  process.exit(0);
}

main();
