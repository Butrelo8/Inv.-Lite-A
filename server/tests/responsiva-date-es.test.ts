import assert from "node:assert/strict";
import test from "node:test";
import { formatSpanishLongDate } from "../doc-gen/responsiva/date-es";

test("formats a December date in Spanish", () => {
  const d = new Date(2025, 11, 8, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "8 de Diciembre del 2025");
});

test("formats a January date in Spanish", () => {
  const d = new Date(2026, 0, 1, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "1 de Enero del 2026");
});

test("uses the local day", () => {
  const d = new Date(2026, 3, 16, 12, 0, 0);
  assert.equal(formatSpanishLongDate(d), "16 de Abril del 2026");
});
