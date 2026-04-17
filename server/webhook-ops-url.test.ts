import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { summarizeWebhookTargetForOps } from "./webhook-ops-url";

describe("summarizeWebhookTargetForOps", () => {
  it("returns hostname, null port for default scheme port, and stable path fingerprint", () => {
    const r = summarizeWebhookTargetForOps("https://hooks.example.com/api/v1/callback");
    assert.equal(r.hostname, "hooks.example.com");
    assert.equal(r.port, null);
    const expected = createHash("sha256").update("/api/v1/callback", "utf8").digest("hex").slice(0, 16);
    assert.equal(r.pathFingerprint, expected);
    assert.match(r.pathFingerprint, /^[0-9a-f]{16}$/);
  });

  it("returns explicit non-default port for https", () => {
    const r = summarizeWebhookTargetForOps("https://example.com:8443/webhook");
    assert.equal(r.hostname, "example.com");
    assert.equal(r.port, 8443);
  });

  it("returns null port for default http port", () => {
    const r = summarizeWebhookTargetForOps("http://example.com/hook");
    assert.equal(r.hostname, "example.com");
    assert.equal(r.port, null);
  });

  it("returns explicit non-default port for http", () => {
    const r = summarizeWebhookTargetForOps("http://example.com:8080/hook");
    assert.equal(r.hostname, "example.com");
    assert.equal(r.port, 8080);
  });

  it("includes search in fingerprint", () => {
    const a = summarizeWebhookTargetForOps("https://x.test/webhook");
    const b = summarizeWebhookTargetForOps("https://x.test/webhook?token=secret");
    assert.notEqual(a.pathFingerprint, b.pathFingerprint);
  });

  it("ignores hash fragment", () => {
    const a = summarizeWebhookTargetForOps("https://x.test/hook");
    const b = summarizeWebhookTargetForOps("https://x.test/hook#section");
    assert.equal(a.pathFingerprint, b.pathFingerprint);
  });

  it("returns placeholder hostname for non-URL input", () => {
    const r = summarizeWebhookTargetForOps("not a url");
    assert.equal(r.hostname, "(invalid-url)");
    assert.equal(r.port, null);
    assert.equal(r.pathFingerprint, "");
  });
});
