import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUserRoleFromApi } from "@shared/auth-role";

test("normalizeUserRoleFromApi accepts known roles", () => {
  assert.equal(normalizeUserRoleFromApi("admin"), "admin");
  assert.equal(normalizeUserRoleFromApi("editor"), "editor");
  assert.equal(normalizeUserRoleFromApi("viewer"), "viewer");
});

test("normalizeUserRoleFromApi falls back to viewer for unknown or invalid", () => {
  assert.equal(normalizeUserRoleFromApi("superadmin"), "viewer");
  assert.equal(normalizeUserRoleFromApi(""), "viewer");
  assert.equal(normalizeUserRoleFromApi(" Admin"), "viewer");
  assert.equal(normalizeUserRoleFromApi(null), "viewer");
  assert.equal(normalizeUserRoleFromApi(undefined), "viewer");
  assert.equal(normalizeUserRoleFromApi(1), "viewer");
});
