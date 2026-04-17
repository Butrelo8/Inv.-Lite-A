import { test } from "node:test";
import assert from "node:assert/strict";
import type { WebhookEndpoint } from "@shared/schema";
import { redactWebhookEndpointSecret, redactWebhookEndpointSecrets } from "../webhook-endpoint-public";

const sampleRow: WebhookEndpoint = {
  id: 1,
  url: "https://example.com/hook",
  secret: "super-secret-signing-key",
  enabled: true,
  eventTypes: ["inventory.created"],
  createdByUserId: 2,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

test("redactWebhookEndpointSecret omits secret", () => {
  const pub = redactWebhookEndpointSecret(sampleRow);
  assert.equal("secret" in pub, false);
  assert.deepEqual(pub, {
    id: 1,
    url: "https://example.com/hook",
    enabled: true,
    eventTypes: ["inventory.created"],
    createdByUserId: 2,
    createdAt: sampleRow.createdAt,
    updatedAt: sampleRow.updatedAt,
  });
});

test("redactWebhookEndpointSecrets maps list", () => {
  const list = redactWebhookEndpointSecrets([sampleRow, { ...sampleRow, id: 2, secret: "other" }]);
  assert.equal(list.length, 2);
  assert.equal("secret" in list[0], false);
  assert.equal("secret" in list[1], false);
  assert.equal(list[0].id, 1);
  assert.equal(list[1].id, 2);
});
