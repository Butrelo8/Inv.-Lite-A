/**
 * Clears DB rows that reference upload files missing on disk (same detection as integrity scan).
 *
 * Default: dry-run (prints counts and samples).
 * Apply: add --apply
 * Employee documents: destructive (DELETE row). With --apply, inventory rows are always fixed; employee doc
 * deletes run only if you also pass --include-employee-documents (otherwise skipped with a warning).
 *
 * Run: npx tsx script/clear-stale-file-refs.ts [--apply] [--include-employee-documents]
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pg from "pg";
import { findMissingDbFileReferences } from "./integrity-scan.js";

const { Pool } = pg;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mustGetDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set. Add it to .env");
  return dbUrl;
}

function parseArgs(argv: string[]): { apply: boolean; includeEmployeeDocuments: boolean } {
  let apply = false;
  let includeEmployeeDocuments = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    if (a === "--include-employee-documents") includeEmployeeDocuments = true;
  }
  return { apply, includeEmployeeDocuments };
}

async function main() {
  const { apply, includeEmployeeDocuments } = parseArgs(process.argv.slice(2));
  const dbUrl = mustGetDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const missing = await findMissingDbFileReferences(pool, REPO_ROOT);
    const itemIds = missing.filter((m) => m.origin === "inventory_items.image_url").map((m) => m.recordId);
    const attachmentIds = missing
      .filter((m) => m.origin === "inventory_attachments.image_url")
      .map((m) => m.recordId);
    const docIds = missing.filter((m) => m.origin === "employee_documents.file_url").map((m) => m.recordId);

    console.log(`Repo root: ${REPO_ROOT}`);
    console.log(`Missing file refs: ${missing.length} total`);
    console.log(`  inventory_items (clear image_url): ${itemIds.length}`);
    console.log(`  inventory_attachments (delete rows): ${attachmentIds.length}`);
    console.log(`  employee_documents (delete rows, opt-in): ${docIds.length}`);

    if (missing.length > 0 && missing.length <= 30) {
      for (const m of missing) {
        console.log(`  - ${m.origin} id=${m.recordId} path=${m.fileUrl}`);
      }
    } else if (missing.length > 30) {
      for (const m of missing.slice(0, 15)) {
        console.log(`  - ${m.origin} id=${m.recordId} path=${m.fileUrl}`);
      }
      console.log(`  ... and ${missing.length - 15} more`);
    }

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to update the database.");
      if (docIds.length > 0) {
        console.log(
          "Employee document rows: add --include-employee-documents with --apply to DELETE those rows (otherwise they are skipped).",
        );
      }
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (itemIds.length > 0) {
        const r = await client.query("update inventory_items set image_url = null where id = any($1::int[])", [
          itemIds,
        ]);
        console.log(`\nCleared inventory_items.image_url: ${r.rowCount ?? 0} row(s)`);
      }

      if (attachmentIds.length > 0) {
        const r = await client.query("delete from inventory_attachments where id = any($1::int[])", [attachmentIds]);
        console.log(`Deleted inventory_attachments: ${r.rowCount ?? 0} row(s)`);
      }

      if (docIds.length > 0) {
        if (!includeEmployeeDocuments) {
          console.warn(
            `\nSkipped ${docIds.length} employee_documents row(s) (missing files). Re-run with --include-employee-documents to delete those rows.`,
          );
        } else {
          const r = await client.query("delete from employee_documents where id = any($1::int[])", [docIds]);
          console.log(`Deleted employee_documents: ${r.rowCount ?? 0} row(s)`);
        }
      }

      await client.query("COMMIT");
      console.log("\nCommitted.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryHref) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
