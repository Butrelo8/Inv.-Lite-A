import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDeleteHistoryRemarks, extractUndoTokenFromRemarks } from "../inventory-bulk-undo-helpers";

describe("inventory-bulk-undo helpers", () => {
  it("extractUndoTokenFromRemarks parses embedded token", () => {
    assert.equal(
      extractUndoTokenFromRemarks("DELETE: Widget [undo:abc_123]"),
      "abc_123",
    );
    assert.equal(extractUndoTokenFromRemarks(null), null);
    assert.equal(extractUndoTokenFromRemarks(""), null);
    assert.equal(extractUndoTokenFromRemarks("no token here"), null);
  });

  it("buildDeleteHistoryRemarks includes optional reason and undo marker", () => {
    const line = buildDeleteHistoryRemarks("BULK_DELETE", "Item A", "tok1", "cleanup");
    assert.match(line, /BULK_DELETE: Item A \(cleanup\) \[undo:tok1\]/);
  });
});
