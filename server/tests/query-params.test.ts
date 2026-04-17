import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseHistoryPagination,
  parseInventoryListPagination,
  parseOpsHealthEventsQuery,
  parsePositiveIntPathParam,
  parseWebhookDeliveriesLimit,
} from "../validation/query-params";

describe("parseInventoryListPagination", () => {
  it("defaults limit 50 and offset 0", () => {
    const r = parseInventoryListPagination({});
    assert.equal(r.limit, 50);
    assert.equal(r.offset, 0);
  });

  it("parses limit and offset", () => {
    const r = parseInventoryListPagination({ limit: "25", offset: "10" });
    assert.equal(r.limit, 25);
    assert.equal(r.offset, 10);
  });

  it("clamps limit to 500", () => {
    const r = parseInventoryListPagination({ limit: "9000" });
    assert.equal(r.limit, 500);
  });

  it("uses 50 when limit is invalid or zero (legacy || 50)", () => {
    assert.equal(parseInventoryListPagination({ limit: "x" }).limit, 50);
    assert.equal(parseInventoryListPagination({ limit: "" }).limit, 50);
    assert.equal(parseInventoryListPagination({ limit: "0" }).limit, 50);
  });
});

describe("parseHistoryPagination", () => {
  it("defaults limit 100 when absent", () => {
    const r = parseHistoryPagination({});
    assert.equal(r.limit, 100);
    assert.equal(r.offset, 0);
  });

  it("defaults limit 100 when limit is empty string (falsy)", () => {
    const r = parseHistoryPagination({ limit: "" });
    assert.equal(r.limit, 100);
  });

  it("parses limit and offset", () => {
    const r = parseHistoryPagination({ limit: "20", offset: "5" });
    assert.equal(r.limit, 20);
    assert.equal(r.offset, 5);
  });
});

describe("parseWebhookDeliveriesLimit", () => {
  it("defaults to 50", () => {
    assert.equal(parseWebhookDeliveriesLimit({}).limit, 50);
  });

  it("clamps to 1..200", () => {
    assert.equal(parseWebhookDeliveriesLimit({ limit: "1" }).limit, 1);
    assert.equal(parseWebhookDeliveriesLimit({ limit: "200" }).limit, 200);
    assert.equal(parseWebhookDeliveriesLimit({ limit: "999" }).limit, 200);
  });

  it("uses 50 when not finite", () => {
    assert.equal(parseWebhookDeliveriesLimit({ limit: "nope" }).limit, 50);
  });
});

/**
 * `GET /api/ops-health/events` uses `parseOpsHealthEventsQuery` (`server/routes/reports-ops-routes.ts`).
 * Invalid `severity` must be ignored (no filter) and parsing must succeed — not HTTP 400 from this layer.
 */
describe("parseOpsHealthEventsQuery", () => {
  it("defaults limit 100", () => {
    const r = parseOpsHealthEventsQuery({});
    assert.equal(r.limit, 100);
    assert.equal(r.severity, undefined);
  });

  it("accepts each valid severity", () => {
    assert.equal(parseOpsHealthEventsQuery({ severity: "critical" }).severity, "critical");
    assert.equal(parseOpsHealthEventsQuery({ severity: "warning" }).severity, "warning");
    assert.equal(parseOpsHealthEventsQuery({ severity: "info" }).severity, "info");
  });

  it("omits severity when invalid string", () => {
    const r = parseOpsHealthEventsQuery({ severity: "nope" });
    assert.equal(r.severity, undefined);
  });

  it("omits severity for empty or whitespace (not an enum member)", () => {
    assert.equal(parseOpsHealthEventsQuery({ severity: "" }).severity, undefined);
    assert.equal(parseOpsHealthEventsQuery({ severity: "   " }).severity, undefined);
  });

  it("omits severity when wrong case (strict match)", () => {
    assert.equal(parseOpsHealthEventsQuery({ severity: "Warning" }).severity, undefined);
    assert.equal(parseOpsHealthEventsQuery({ severity: "CRITICAL" }).severity, undefined);
  });

  it("still parses limit when severity is invalid", () => {
    const r = parseOpsHealthEventsQuery({ limit: "25", severity: "bogus" });
    assert.equal(r.limit, 25);
    assert.equal(r.severity, undefined);
  });

  it("parse does not throw for invalid severity", () => {
    assert.doesNotThrow(() => parseOpsHealthEventsQuery({ severity: "not-a-severity" }));
  });
});

describe("parsePositiveIntPathParam", () => {
  it("accepts digit strings and positive integers", () => {
    assert.deepEqual(parsePositiveIntPathParam("1"), { ok: true, id: 1 });
    assert.deepEqual(parsePositiveIntPathParam("42"), { ok: true, id: 42 });
    assert.deepEqual(parsePositiveIntPathParam(99), { ok: true, id: 99 });
  });

  it("rejects non-integers, zero, negative, and non-numeric", () => {
    assert.deepEqual(parsePositiveIntPathParam("1.5"), { ok: false });
    assert.deepEqual(parsePositiveIntPathParam("0"), { ok: false });
    assert.deepEqual(parsePositiveIntPathParam("-3"), { ok: false });
    assert.deepEqual(parsePositiveIntPathParam("abc"), { ok: false });
    assert.deepEqual(parsePositiveIntPathParam(""), { ok: false });
    assert.deepEqual(parsePositiveIntPathParam(undefined), { ok: false });
  });
});
