import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import {
  INVALID_SITE_ID_QUERY_CODE,
  parseSiteIdQuery,
} from "../inventory-list-context";

function req(query: Record<string, unknown>): Request {
  return { query } as Request;
}

test("parseSiteIdQuery: scoping off always ok undefined", () => {
  const prev = process.env.SITE_SCOPING_ENABLED;
  process.env.SITE_SCOPING_ENABLED = "false";
  try {
    assert.deepEqual(parseSiteIdQuery(req({ siteId: "not-a-number" })), {
      ok: true,
      siteId: undefined,
    });
  } finally {
    process.env.SITE_SCOPING_ENABLED = prev;
  }
});

test("parseSiteIdQuery: scoping on absent or empty → ok undefined", () => {
  const prev = process.env.SITE_SCOPING_ENABLED;
  process.env.SITE_SCOPING_ENABLED = "true";
  try {
    assert.deepEqual(parseSiteIdQuery(req({})), { ok: true, siteId: undefined });
    assert.deepEqual(parseSiteIdQuery(req({ siteId: "" })), { ok: true, siteId: undefined });
    assert.deepEqual(parseSiteIdQuery(req({ siteId: "  " })), { ok: true, siteId: undefined });
    assert.deepEqual(parseSiteIdQuery(req({ siteId: [] })), { ok: true, siteId: undefined });
  } finally {
    process.env.SITE_SCOPING_ENABLED = prev;
  }
});

test("parseSiteIdQuery: scoping on valid positive integer", () => {
  const prev = process.env.SITE_SCOPING_ENABLED;
  process.env.SITE_SCOPING_ENABLED = "true";
  try {
    assert.deepEqual(parseSiteIdQuery(req({ siteId: "42" })), { ok: true, siteId: 42 });
    assert.deepEqual(parseSiteIdQuery(req({ siteId: ["7"] })), { ok: true, siteId: 7 });
  } finally {
    process.env.SITE_SCOPING_ENABLED = prev;
  }
});

test("parseSiteIdQuery: scoping on invalid → ok false", () => {
  const prev = process.env.SITE_SCOPING_ENABLED;
  process.env.SITE_SCOPING_ENABLED = "true";
  try {
    for (const siteId of ["0", "-1", "3.14", "1e2", "12abc", "abc", "NaN"]) {
      assert.equal(parseSiteIdQuery(req({ siteId })).ok, false, `expected invalid: ${siteId}`);
    }
  } finally {
    process.env.SITE_SCOPING_ENABLED = prev;
  }
});

test("parseSiteIdQuery: stable error code export", () => {
  assert.equal(INVALID_SITE_ID_QUERY_CODE, "invalid_site_id");
});
