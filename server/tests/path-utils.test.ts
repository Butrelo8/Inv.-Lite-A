import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";

import { resolveSafeFilePath, resolveStoredFilePath } from "../path-utils";

test("resolveSafeFilePath: ignores directories via basename()", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveSafeFilePath(baseDir, "../../secret.txt");
  assert.equal(p, path.resolve(baseDir, "secret.txt"));
});

test("resolveSafeFilePath: resolves within baseDir", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveSafeFilePath(baseDir, "safe.jpg");
  assert.equal(p, path.resolve(baseDir, "safe.jpg"));
});

test("resolveSafeFilePath: rejects resolving to baseDir itself", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveSafeFilePath(baseDir, ".");
  assert.equal(p, null);
});

test("resolveStoredFilePath: resolves stored /uploads/... safely", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveStoredFilePath(baseDir, "/uploads/safe.jpg");
  assert.equal(p, path.resolve(process.cwd(), "uploads/safe.jpg"));
});

test("resolveStoredFilePath: blocks traversal from legacy/malformed fileUrl", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveStoredFilePath(baseDir, "/uploads/../../etc/passwd");
  assert.equal(p, null);
});

test("resolveStoredFilePath: normalizes backslashes in stored paths", () => {
  const baseDir = path.join(process.cwd(), "uploads");
  const p = resolveStoredFilePath(baseDir, "/uploads\\..\\..\\secret.txt");
  assert.equal(p, null);
});

