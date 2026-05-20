import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INVENTORY_EXPORT_HEADERS_VIEWER,
  INVENTORY_EXPORT_HEADERS_ADMIN,
  INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_ADMIN,
  INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST,
} from "../inventory-export-config";

test("inventory export: viewer headers exclude internal notes", async () => {
  const viewerCsv = INVENTORY_EXPORT_HEADERS_VIEWER as readonly string[];
  const viewerPdf = INVENTORY_EXPORT_PDF_HEADERS_VIEWER as readonly string[];
  assert.ok(!viewerCsv.includes("notes"), "viewer CSV/XLSX must not include notes");
  assert.ok(!viewerPdf.includes("Notes"), "viewer PDF must not include Notes");
});

test("inventory export: admin headers include internal notes", async () => {
  const adminCsv = INVENTORY_EXPORT_HEADERS_ADMIN as readonly string[];
  const adminPdf = INVENTORY_EXPORT_PDF_HEADERS_ADMIN as readonly string[];
  assert.ok(adminCsv.includes("notes"), "admin CSV/XLSX must include notes");
  assert.ok(adminPdf.includes("Notes"), "admin PDF must include Notes");
});

test("inventory export: checklist headers include signing columns", async () => {
  const checklistPdf = INVENTORY_EXPORT_PDF_HEADERS_CHECKLIST as readonly string[];
  assert.ok(checklistPdf.includes("Firma"), "checklist PDF must include Firma");
  assert.ok(checklistPdf.includes("Cond. Regreso"), "checklist PDF must include Cond. Regreso");
});
