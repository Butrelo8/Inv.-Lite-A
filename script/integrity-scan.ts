/**
 * Read-only integrity scanner.
 * - Detects DB and file-system drift
 * - Writes scan artifact + repair proposal
 * - Emits ops pass/fail events
 *
 * Run: npm run integrity:scan
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pg from "pg";

const { Pool } = pg;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawReportsDir = process.env.INTEGRITY_REPORT_DIR?.trim();
const REPORTS_DIR = rawReportsDir
  ? path.isAbsolute(rawReportsDir)
    ? rawReportsDir
    : path.resolve(REPO_ROOT, rawReportsDir)
  : path.join(REPO_ROOT, "reports", "integrity");
const SAMPLE_LIMIT = Math.max(1, Math.min(parseInt(process.env.INTEGRITY_SAMPLE_LIMIT ?? "25", 10), 200));

type RepairSeverity = "safe" | "needs review" | "destructive";

export type Finding = {
  id: string;
  title: string;
  ok: boolean;
  count: number;
  sample: Array<Record<string, unknown>>;
  details: string;
};

export type RepairAction = {
  title: string;
  severity: RepairSeverity;
  recommendation: string;
  sampleSql?: string;
};

export type IntegrityReport = {
  ok: boolean;
  scanId: string;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  summary: {
    totalFindings: number;
    totalIssues: number;
  };
  findings: Finding[];
};

function mustGetDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set. Add it to .env");
  return dbUrl;
}

function ensureReportsDir(): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function isoStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

function toInt(n: unknown): number {
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

async function runScan(pool: pg.Pool): Promise<Finding[]> {
  const findings: Finding[] = [];

  const orphanAttachments = await pool.query(
    `select a.id, a.item_id
     from inventory_attachments a
     left join inventory_items i on i.id = a.item_id
     where i.id is null
     order by a.id desc
     limit $1`,
    [SAMPLE_LIMIT],
  );
  const orphanAttachmentsCount = await pool.query(
    `select count(*)::int as count
     from inventory_attachments a
     left join inventory_items i on i.id = a.item_id
     where i.id is null`,
  );
  findings.push({
    id: "orphan_inventory_attachments",
    title: "Orphan inventory attachments",
    ok: toInt(orphanAttachmentsCount.rows[0]?.count) === 0,
    count: toInt(orphanAttachmentsCount.rows[0]?.count),
    sample: orphanAttachments.rows,
    details: "Attachments that reference a missing inventory item.",
  });

  const orphanNotes = await pool.query(
    `select n.id, n.item_id
     from shared_notes n
     left join inventory_items i on i.id = n.item_id
     where i.id is null
     order by n.id desc
     limit $1`,
    [SAMPLE_LIMIT],
  );
  const orphanNotesCount = await pool.query(
    `select count(*)::int as count
     from shared_notes n
     left join inventory_items i on i.id = n.item_id
     where i.id is null`,
  );
  findings.push({
    id: "orphan_shared_notes",
    title: "Orphan shared notes",
    ok: toInt(orphanNotesCount.rows[0]?.count) === 0,
    count: toInt(orphanNotesCount.rows[0]?.count),
    sample: orphanNotes.rows,
    details: "Shared notes that reference a missing inventory item.",
  });

  const orphanDocs = await pool.query(
    `select d.id, d.item_id, d.file_url
     from employee_documents d
     left join inventory_items i on i.id = d.item_id
     where d.item_id is not null and i.id is null
     order by d.id desc
     limit $1`,
    [SAMPLE_LIMIT],
  );
  const orphanDocsCount = await pool.query(
    `select count(*)::int as count
     from employee_documents d
     left join inventory_items i on i.id = d.item_id
     where d.item_id is not null and i.id is null`,
  );
  findings.push({
    id: "orphan_employee_documents",
    title: "Orphan employee document links",
    ok: toInt(orphanDocsCount.rows[0]?.count) === 0,
    count: toInt(orphanDocsCount.rows[0]?.count),
    sample: orphanDocs.rows,
    details: "Employee documents linked to a missing inventory item.",
  });

  const historyFkDrift = await pool.query(
    `select h.id, h.product_id, h.user_id, h.company_id
     from inventory_history h
     left join inventory_items i on i.id = h.product_id
     left join users u on u.id = h.user_id
     left join companies c on c.id = h.company_id
     where (h.product_id is not null and i.id is null)
        or (h.user_id is not null and u.id is null)
        or (h.company_id is not null and c.id is null)
     order by h.id desc
     limit $1`,
    [SAMPLE_LIMIT],
  );
  const historyFkDriftCount = await pool.query(
    `select count(*)::int as count
     from inventory_history h
     left join inventory_items i on i.id = h.product_id
     left join users u on u.id = h.user_id
     left join companies c on c.id = h.company_id
     where (h.product_id is not null and i.id is null)
        or (h.user_id is not null and u.id is null)
        or (h.company_id is not null and c.id is null)`,
  );
  findings.push({
    id: "history_fk_drift",
    title: "History foreign-key drift",
    ok: toInt(historyFkDriftCount.rows[0]?.count) === 0,
    count: toInt(historyFkDriftCount.rows[0]?.count),
    sample: historyFkDrift.rows,
    details: "History entries whose product/user/company references no longer exist.",
  });

  const missingFilesSample: Array<Record<string, unknown>> = [];
  const allRefs = await pool.query<{ origin: string; record_id: number; file_url: string }>(
    `select 'inventory_items.image_url'::text as origin, id as record_id, image_url as file_url
       from inventory_items
      where image_url is not null and image_url <> ''
     union all
     select 'inventory_attachments.image_url'::text as origin, id as record_id, image_url as file_url
       from inventory_attachments
      where image_url is not null and image_url <> ''
     union all
     select 'employee_documents.file_url'::text as origin, id as record_id, file_url
       from employee_documents
      where file_url is not null and file_url <> ''`,
  );
  let missingCount = 0;
  for (const row of allRefs.rows) {
    const rel = row.file_url.startsWith("/") ? row.file_url.slice(1) : row.file_url;
    const full = path.resolve(REPO_ROOT, rel);
    if (!full.startsWith(REPO_ROOT)) continue;
    if (!fs.existsSync(full)) {
      missingCount += 1;
      if (missingFilesSample.length < SAMPLE_LIMIT) {
        missingFilesSample.push({ origin: row.origin, recordId: row.record_id, fileUrl: row.file_url });
      }
    }
  }
  findings.push({
    id: "missing_files_for_db_references",
    title: "DB-referenced files missing on disk",
    ok: missingCount === 0,
    count: missingCount,
    sample: missingFilesSample,
    details: "Rows reference file paths that are not present in local storage.",
  });

  return findings;
}

export function buildRepairActions(findings: Finding[]): RepairAction[] {
  const actions: RepairAction[] = [];
  const byId = new Map(findings.map((f) => [f.id, f]));

  const orphanAttachments = byId.get("orphan_inventory_attachments");
  if (orphanAttachments && orphanAttachments.count > 0) {
    actions.push({
      title: "Review orphan inventory attachments",
      severity: "safe",
      recommendation: "Inspect sample rows and remove rows that reference missing inventory items after confirming no source item can be recovered.",
      sampleSql:
        "select a.id, a.item_id from inventory_attachments a left join inventory_items i on i.id = a.item_id where i.id is null;",
    });
  }

  const orphanNotes = byId.get("orphan_shared_notes");
  if (orphanNotes && orphanNotes.count > 0) {
    actions.push({
      title: "Review orphan shared notes",
      severity: "safe",
      recommendation: "Validate business context, then remove orphan notes or reattach to valid items.",
      sampleSql: "select n.id, n.item_id from shared_notes n left join inventory_items i on i.id = n.item_id where i.id is null;",
    });
  }

  const orphanDocs = byId.get("orphan_employee_documents");
  if (orphanDocs && orphanDocs.count > 0) {
    actions.push({
      title: "Repair employee document links",
      severity: "needs review",
      recommendation: "Either nullify broken item links or remap documents to valid items after manual review.",
      sampleSql:
        "select d.id, d.item_id from employee_documents d left join inventory_items i on i.id = d.item_id where d.item_id is not null and i.id is null;",
    });
  }

  const history = byId.get("history_fk_drift");
  if (history && history.count > 0) {
    actions.push({
      title: "Investigate history FK drift",
      severity: "needs review",
      recommendation: "History drift may indicate destructive deletes or prior migration issues; investigate root cause before any updates.",
      sampleSql:
        "select h.id, h.product_id, h.user_id, h.company_id from inventory_history h left join inventory_items i on i.id = h.product_id left join users u on u.id = h.user_id left join companies c on c.id = h.company_id where (h.product_id is not null and i.id is null) or (h.user_id is not null and u.id is null) or (h.company_id is not null and c.id is null);",
    });
  }

  const missingFiles = byId.get("missing_files_for_db_references");
  if (missingFiles && missingFiles.count > 0) {
    actions.push({
      title: "Resolve missing file references",
      severity: "destructive",
      recommendation:
        "Attempt restore from backup first. Only after restore attempts, consider clearing stale file references in DB records.",
      sampleSql:
        "select id, image_url from inventory_items where image_url is not null and image_url <> '';",
    });
  }

  if (actions.length === 0) {
    actions.push({
      title: "No repair actions required",
      severity: "safe",
      recommendation: "All checks passed in this scan.",
    });
  }

  return actions;
}

function renderRepairReport(report: IntegrityReport, actions: RepairAction[]): string {
  const lines: string[] = [];
  lines.push("# Integrity Repair Proposal");
  lines.push("");
  lines.push(`Scan ID: ${report.scanId}`);
  lines.push(`Started: ${report.startedAt}`);
  lines.push(`Finished: ${report.finishedAt}`);
  lines.push(`Duration (sec): ${report.durationSec}`);
  lines.push(`Status: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## Findings");
  for (const f of report.findings) {
    lines.push(`- ${f.title}: ${f.count} issue(s)`);
  }
  lines.push("");
  lines.push("## Proposed Repair Actions (Read-only)");
  for (const action of actions) {
    lines.push(`### ${action.title}`);
    lines.push(`- Severity: ${action.severity}`);
    lines.push(`- Recommendation: ${action.recommendation}`);
    if (action.sampleSql) {
      lines.push("- Sample SQL (do not execute blindly):");
      lines.push("```sql");
      lines.push(action.sampleSql);
      lines.push("```");
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function emitIntegrityEvent(dbUrl: string, report: IntegrityReport): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });
  try {
    await pool.query(
      `insert into ops_events (event_type, severity, source, environment, payload, created_at)
       values ($1, $2, $3, $4, $5::jsonb, now())`,
      [
        report.ok ? "job.integrity_scan_success" : "job.integrity_scan_failure",
        report.ok ? "info" : "warning",
        "integrity-scan-script",
        process.env.NODE_ENV || "development",
        JSON.stringify({
          scanId: report.scanId,
          totalFindings: report.summary.totalFindings,
          totalIssues: report.summary.totalIssues,
          durationSec: report.durationSec,
          reportOk: report.ok,
        }),
      ],
    );
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code !== "42P01") {
      console.error("Failed to emit integrity scan event:", err instanceof Error ? err.message : err);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  const dbUrl = mustGetDatabaseUrl();
  ensureReportsDir();
  const started = new Date();
  const scanId = `integrity_scan_${isoStamp(started)}`;
  const dbPool = new Pool({ connectionString: dbUrl });
  try {
    const findings = await runScan(dbPool);
    const totalIssues = findings.reduce((sum, f) => sum + f.count, 0);
    const finished = new Date();
    const report: IntegrityReport = {
      ok: totalIssues === 0,
      scanId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationSec: Math.round((finished.getTime() - started.getTime()) / 1000),
      summary: {
        totalFindings: findings.length,
        totalIssues,
      },
      findings,
    };
    const actions = buildRepairActions(findings);
    const jsonPath = path.join(REPORTS_DIR, `integrity-scan-${isoStamp(started)}.json`);
    const repairPath = path.join(REPORTS_DIR, `repair-report-${isoStamp(started)}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    fs.writeFileSync(repairPath, renderRepairReport(report, actions), "utf8");
    console.log(`Integrity scan report: ${jsonPath}`);
    console.log(`Repair proposal: ${repairPath}`);
    await emitIntegrityEvent(dbUrl, report);
    if (!report.ok) process.exitCode = 1;
  } catch (err) {
    const finished = new Date();
    const failReport: IntegrityReport = {
      ok: false,
      scanId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationSec: Math.round((finished.getTime() - started.getTime()) / 1000),
      summary: {
        totalFindings: 0,
        totalIssues: 1,
      },
      findings: [
        {
          id: "scan_execution_failure",
          title: "Integrity scan execution failure",
          ok: false,
          count: 1,
          sample: [],
          details: err instanceof Error ? err.message : String(err),
        },
      ],
    };
    const failPath = path.join(REPORTS_DIR, `integrity-scan-${isoStamp(started)}.json`);
    fs.writeFileSync(failPath, JSON.stringify(failReport, null, 2), "utf8");
    await emitIntegrityEvent(dbUrl, failReport);
    console.error("Integrity scan failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await dbPool.end().catch(() => undefined);
  }
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryHref) {
  void main();
}

