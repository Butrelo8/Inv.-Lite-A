import { test, describe, mock, afterEach, beforeEach, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "crypto";
import { webhookEndpoints, webhookOutbox, opsEvents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { webhookHttpDelivery, type WebhookDeliveryHttpOptions } from "../webhook-delivery-http";

const defaultTestDbUrl = "postgresql://inventario:inventario@127.0.0.1:5432/inventario";

describe("Webhook Processing", () => {
  let processWebhooks: typeof import("../webhooks").processWebhooks;
  let db: typeof import("../db").db;
  let pool: typeof import("../db").pool;
  let endpointId: number;
  let outboxId: number;
  const secret = "test-secret-123456";

  before(async () => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = defaultTestDbUrl;
    }
    const webhooksMod = await import("../webhooks");
    const dbMod = await import("../db");
    processWebhooks = webhooksMod.processWebhooks;
    db = dbMod.db;
    pool = dbMod.pool;
    await pool.query(
      `ALTER TABLE webhook_outbox ADD COLUMN IF NOT EXISTS processing_claimed_at timestamptz`,
    );
  });

  beforeEach(async () => {
    // Insert test endpoint
    const [endpoint] = await db.insert(webhookEndpoints).values({
      url: "http://example.com/webhook",
      secret,
      eventTypes: ["test.event"],
      enabled: true,
    }).returning();
    endpointId = endpoint.id;
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(webhookOutbox).where(eq(webhookOutbox.endpointId, endpointId));
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));
    await db.delete(opsEvents).where(eq(opsEvents.eventType, "job.webhook_delivery_dead"));
  });

  test("generates correct HMAC signature and completes on 2xx", async () => {
    const payload = { test: true };
    const [row] = await db.insert(webhookOutbox).values({
      eventId: "event-123",
      eventType: "test.event",
      payload,
      endpointId,
      status: "pending",
      attemptCount: 0,
    }).returning();
    outboxId = row.id;

    let deliveryCall: { headers: Record<string, string>; body: string } | undefined;

    mock.method(webhookHttpDelivery, "send", async (opts: WebhookDeliveryHttpOptions) => {
      deliveryCall = { headers: opts.headers, body: opts.body };
      return { ok: true, status: 200, statusText: "OK" };
    });

    await processWebhooks();

    assert.ok(deliveryCall);
    assert.equal(deliveryCall.headers["X-Webhook-Id"], "event-123");
    assert.equal(deliveryCall.headers["X-Webhook-Event"], "test.event");

    const sig = createHmac("sha256", secret)
      .update(`event-123:${deliveryCall.headers["X-Webhook-Timestamp"]}:${JSON.stringify(payload)}`)
      .digest("hex");
    assert.equal(deliveryCall.headers["X-Webhook-Signature"], sig);

    // Verify DB update
    const [updatedRow] = await db.select().from(webhookOutbox).where(eq(webhookOutbox.id, outboxId));
    assert.equal(updatedRow.status, "completed");

    mock.restoreAll();
  });

  test("increments attemptCount and calculates backoff on failure", async () => {
    const [row] = await db.insert(webhookOutbox).values({
      eventId: "event-failed-1",
      eventType: "test.event",
      payload: {},
      endpointId,
      status: "pending",
      attemptCount: 0,
    }).returning();

    mock.method(webhookHttpDelivery, "send", async () => ({
      ok: false,
      error: "HTTP Error: 500 Internal Server Error",
      status: 500,
      statusText: "Internal Server Error",
    }));

    await processWebhooks();

    const [updatedRow] = await db.select().from(webhookOutbox).where(eq(webhookOutbox.id, row.id));
    assert.equal(updatedRow.status, "pending");
    assert.equal(updatedRow.attemptCount, 1);
    assert.equal(updatedRow.lastError, "HTTP Error: 500 Internal Server Error");
    assert.ok(updatedRow.nextAttemptAt);
    
    // Should be in about 5 seconds (5000ms delay for attempt 1)
    const diff = updatedRow.nextAttemptAt.getTime() - Date.now();
    assert.ok(diff > 0 && diff <= 5000);

    mock.restoreAll();
  });

  test("marks as dead after max attempts and logs opsEvent", async () => {
    const [row] = await db.insert(webhookOutbox).values({
      eventId: "event-dead-1",
      eventType: "test.event",
      payload: {},
      endpointId,
      status: "pending",
      attemptCount: 4, // Next failure will make it 5, which is max
      nextAttemptAt: new Date(),
    }).returning();

    mock.method(webhookHttpDelivery, "send", async () => ({
      ok: false,
      error: "Network timeout",
    }));

    await processWebhooks();

    const [updatedRow] = await db.select().from(webhookOutbox).where(eq(webhookOutbox.id, row.id));
    assert.equal(updatedRow.status, "dead");
    assert.equal(updatedRow.attemptCount, 5);
    assert.equal(updatedRow.lastError, "Network timeout");

    const events = await db.select().from(opsEvents).where(eq(opsEvents.eventType, "job.webhook_delivery_dead"));
    assert.equal(events.length, 1);
    const eventPayload = events[0].payload as Record<string, unknown>;
    assert.equal(eventPayload.eventId, "event-dead-1");
    const wt = eventPayload.webhookTarget as {
      hostname: string;
      port: number | null;
      pathFingerprint: string;
    };
    assert.equal(wt.hostname, "example.com");
    assert.equal(wt.port, null);
    const expectedFp = createHash("sha256").update("/webhook", "utf8").digest("hex").slice(0, 16);
    assert.equal(wt.pathFingerprint, expectedFp);
    assert.equal(eventPayload.url, undefined);

    mock.restoreAll();
  });

  test("reclaims stale processing rows and delivers on next poll", async () => {
    const staleClaimedAt = new Date(Date.now() - 10 * 60 * 1000);
    const [row] = await db.insert(webhookOutbox).values({
      eventId: "event-stale-processing-1",
      eventType: "test.event",
      payload: { recovered: true },
      endpointId,
      status: "processing",
      attemptCount: 0,
      processingClaimedAt: staleClaimedAt,
    }).returning();
    outboxId = row.id;

    mock.method(webhookHttpDelivery, "send", async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
    }));

    await processWebhooks();

    const [updatedRow] = await db.select().from(webhookOutbox).where(eq(webhookOutbox.id, outboxId));
    assert.equal(updatedRow.status, "completed");
    assert.equal(updatedRow.processingClaimedAt, null);

    mock.restoreAll();
  });

  test("does not reclaim recent processing rows (still in-flight window)", async () => {
    const recentClaimedAt = new Date(Date.now() - 60 * 1000);
    const [row] = await db.insert(webhookOutbox).values({
      eventId: "event-recent-processing-1",
      eventType: "test.event",
      payload: {},
      endpointId,
      status: "processing",
      attemptCount: 0,
      processingClaimedAt: recentClaimedAt,
    }).returning();

    await processWebhooks();

    const [updatedRow] = await db.select().from(webhookOutbox).where(eq(webhookOutbox.id, row.id));
    assert.equal(updatedRow.status, "processing");
    assert.ok(updatedRow.processingClaimedAt);

    await db.delete(webhookOutbox).where(eq(webhookOutbox.id, row.id));

    mock.restoreAll();
  });
});
