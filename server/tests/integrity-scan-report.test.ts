import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRepairActions, type Finding } from "../../script/integrity-scan";

test("buildRepairActions returns no-op action when all checks pass", () => {
  const findings: Finding[] = [
    {
      id: "orphan_inventory_attachments",
      title: "Orphan inventory attachments",
      ok: true,
      count: 0,
      sample: [],
      details: "",
    },
  ];
  const actions = buildRepairActions(findings);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.title, "No repair actions required");
  assert.equal(actions[0]?.severity, "safe");
});

test("buildRepairActions categorizes missing files as destructive", () => {
  const findings: Finding[] = [
    {
      id: "missing_files_for_db_references",
      title: "DB-referenced files missing on disk",
      ok: false,
      count: 3,
      sample: [{ recordId: 1 }],
      details: "",
    },
  ];
  const actions = buildRepairActions(findings);
  const missingFilesAction = actions.find((a) => a.title === "Resolve missing file references");
  assert.ok(missingFilesAction);
  assert.equal(missingFilesAction?.severity, "destructive");
});

