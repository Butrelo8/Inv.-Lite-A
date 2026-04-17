import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { classifyUploadPath } from "../../script/integrity-file-paths";

test("classifyUploadPath returns ok when file exists under repo root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inv-integrity-"));
  try {
    const rel = "uploads/deep/file.txt";
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x", "utf8");
    assert.equal(classifyUploadPath(rel, dir), "ok");
    assert.equal(classifyUploadPath(`/${rel}`, dir), "ok");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("classifyUploadPath returns missing when path is under repo but file absent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inv-integrity-"));
  try {
    assert.equal(classifyUploadPath("uploads/nope.bin", dir), "missing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("classifyUploadPath returns skip when resolved path escapes repo root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inv-integrity-"));
  try {
    const escapeRel = path.relative(dir, path.join(path.dirname(dir), "integrity_escape_probe")).replaceAll("\\", "/");
    assert.equal(classifyUploadPath(escapeRel, dir), "skip");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
