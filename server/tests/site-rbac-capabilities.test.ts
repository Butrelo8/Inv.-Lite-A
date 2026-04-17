import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SITE_CAPABILITIES,
  capsForGlobalRole,
  isKnownSiteCapability,
  parseSiteCapabilityStringsFromJsonb,
  SITE_CAPABILITIES,
} from "@shared/site-rbac";

test("parseSiteCapabilityStringsFromJsonb: array and stringified JSON", () => {
  assert.deepEqual(parseSiteCapabilityStringsFromJsonb(["inventory:read", 1, "x"]), ["inventory:read", "x"]);
  assert.deepEqual(parseSiteCapabilityStringsFromJsonb('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseSiteCapabilityStringsFromJsonb(null), []);
});

test("isKnownSiteCapability: only ALL_SITE_CAPABILITIES members", () => {
  assert.equal(isKnownSiteCapability(SITE_CAPABILITIES.INVENTORY_READ), true);
  assert.equal(isKnownSiteCapability("inventory:typo"), false);
  assert.equal(ALL_SITE_CAPABILITIES.length, 5);
});

test("capsForGlobalRole: viewer, editor, admin", () => {
  assert.deepEqual(Array.from(capsForGlobalRole("viewer")).sort(), [SITE_CAPABILITIES.INVENTORY_READ]);
  assert.deepEqual(
    Array.from(capsForGlobalRole("editor")).sort(),
    [
      SITE_CAPABILITIES.ASSIGNMENTS_MANAGE,
      SITE_CAPABILITIES.INVENTORY_READ,
      SITE_CAPABILITIES.INVENTORY_WRITE,
    ].sort(),
  );
  assert.equal(capsForGlobalRole("admin").size, ALL_SITE_CAPABILITIES.length);
  for (const c of ALL_SITE_CAPABILITIES) {
    assert.equal(capsForGlobalRole("admin").has(c), true);
  }
});

test("capsForGlobalRole: unknown role strings fail closed to inventory:read only", () => {
  for (const role of ["superuser", "admim", "", "EDITOR"]) {
    const caps = capsForGlobalRole(role);
    assert.equal(caps.size, 1);
    assert.equal(caps.has(SITE_CAPABILITIES.INVENTORY_READ), true);
  }
});
