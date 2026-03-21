import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INVENTORY_EXPORT_HEADERS_VIEWER,
  INVENTORY_EXPORT_HEADERS_ADMIN,
  INVENTORY_EXPORT_PDF_HEADERS_VIEWER,
  INVENTORY_EXPORT_PDF_HEADERS_ADMIN,
} from "../inventory-export-config";

test("inventory export: viewer headers exclude internal notes", async () => {
  assert.ok(!INVENTORY_EXPORT_HEADERS_VIEWER.includes("notes"), "viewer CSV/XLSX must not include notes");
  assert.ok(!INVENTORY_EXPORT_PDF_HEADERS_VIEWER.includes("Notes"), "viewer PDF must not include Notes");
});

test("inventory export: admin headers include internal notes", async () => {
  assert.ok(INVENTORY_EXPORT_HEADERS_ADMIN.includes("notes"), "admin CSV/XLSX must include notes");
  assert.ok(INVENTORY_EXPORT_PDF_HEADERS_ADMIN.includes("Notes"), "admin PDF must include Notes");
});

