import { test } from "node:test";
import assert from "node:assert/strict";
import type { WebhookOutbox } from "@shared/schema";
import { mapWebhookDeliveriesForRole } from "../webhook-deliveries";

function row(partial: Partial<WebhookOutbox> & Pick<WebhookOutbox, "id" | "eventId" | "eventType" | "payload" | "endpointId" | "status">): WebhookOutbox {
  return {
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: new Date(),
    processingClaimedAt: null,
    ...partial,
  };
}

test("mapWebhookDeliveriesForRole: editor gets null payload + flag", () => {
  const rows = [
    row({
      id: 1,
      eventId: "e1",
      eventType: "inventory.updated",
      payload: { secret: true },
      endpointId: 9,
      status: "pending",
    }),
  ];
  const mapped = mapWebhookDeliveriesForRole(rows, "editor");
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]!.payload, null);
  assert.equal(mapped[0]!.payloadRedacted, true);
});

test("mapWebhookDeliveriesForRole: admin keeps payload", () => {
  const payload = { a: 1 };
  const rows = [
    row({
      id: 2,
      eventId: "e2",
      eventType: "x",
      payload,
      endpointId: 1,
      status: "completed",
      attemptCount: 1,
    }),
  ];
  const mapped = mapWebhookDeliveriesForRole(rows, "admin");
  assert.deepEqual(mapped[0]!.payload, payload);
  assert.equal(mapped[0]!.payloadRedacted, false);
});
