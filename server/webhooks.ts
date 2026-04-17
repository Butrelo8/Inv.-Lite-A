import { db, pool } from "./db";
import { webhookOutbox, webhookEndpoints, opsEvents } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import { summarizeWebhookTargetForOps } from "./webhook-ops-url";
import { resolveWebhookOutboundConnect } from "./webhook-url-policy";
import { webhookHttpDelivery } from "./webhook-delivery-http";

// Array of retry delays in ms: 5s, 30s, 2m, 10m, 1h
const RETRY_DELAYS_MS = [5 * 1000, 30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000, 60 * 60 * 1000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

/** After this age, a `processing` row is treated as a crashed claim and returned to `pending`. */
const STALE_PROCESSING_CLAIM_MS = 5 * 60 * 1000;

const CLAIM_BATCH_LIMIT = 20;

function messageFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type ClaimedOutboxRow = {
  id: number;
  event_id: string;
  event_type: string;
  payload: unknown;
  attempt_count: number;
  endpoint_id: number;
};

let pollerTimeout: NodeJS.Timeout | null = null;
let isPolling = false;

async function reclaimStaleWebhookClaims(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_CLAIM_MS);
  await pool.query(
    `UPDATE webhook_outbox
     SET status = 'pending', processing_claimed_at = NULL
     WHERE status = 'processing'
       AND processing_claimed_at IS NOT NULL
       AND processing_claimed_at < $1`,
    [staleBefore],
  );
}

async function claimWebhookOutboxBatch(now: Date): Promise<ClaimedOutboxRow[]> {
  const res = await pool.query<ClaimedOutboxRow>(
    `WITH picked AS (
      SELECT w.id
      FROM webhook_outbox w
      WHERE w.status = 'pending'
        AND (w.next_attempt_at IS NULL OR w.next_attempt_at <= $1)
      ORDER BY w.id
      LIMIT $2
      FOR UPDATE OF w SKIP LOCKED
    )
    UPDATE webhook_outbox o
    SET status = 'processing',
        processing_claimed_at = $1
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.event_id, o.event_type, o.payload, o.attempt_count, o.endpoint_id`,
    [now, CLAIM_BATCH_LIMIT],
  );
  return res.rows;
}

export async function processWebhooks() {
  if (isPolling) return;
  isPolling = true;
  try {
    const now = new Date();

    await reclaimStaleWebhookClaims(now);

    const claimedRows = await claimWebhookOutboxBatch(now);
    if (claimedRows.length === 0) return;

    const endpointIds = Array.from(new Set(claimedRows.map((r) => r.endpoint_id)));
    const endpointRows = await db
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        secret: webhookEndpoints.secret,
      })
      .from(webhookEndpoints)
      .where(inArray(webhookEndpoints.id, endpointIds));

    const endpointById = new Map(endpointRows.map((e) => [e.id, e]));

    const pendingRows: Array<{
      id: number;
      eventId: string;
      eventType: string;
      payload: unknown;
      attemptCount: number;
      endpointId: number;
      url: string;
      secret: string;
    }> = [];

    for (const r of claimedRows) {
      const ep = endpointById.get(r.endpoint_id);
      if (!ep) {
        await db
          .update(webhookOutbox)
          .set({
            status: "dead",
            lastError: "webhook endpoint missing for outbox row",
            processingClaimedAt: null,
          })
          .where(eq(webhookOutbox.id, r.id));
        continue;
      }
      pendingRows.push({
        id: r.id,
        eventId: r.event_id,
        eventType: r.event_type,
        payload: r.payload,
        attemptCount: r.attempt_count,
        endpointId: r.endpoint_id,
        url: ep.url,
        secret: ep.secret,
      });
    }

    for (const row of pendingRows) {
      const resolved = await resolveWebhookOutboundConnect(row.url);
      if (!resolved.ok) {
        await db
          .update(webhookOutbox)
          .set({
            status: "dead",
            attemptCount: row.attemptCount + 1,
            lastError: resolved.message,
            processingClaimedAt: null,
          })
          .where(eq(webhookOutbox.id, row.id));
        await db
          .insert(opsEvents)
          .values({
            eventType: "job.webhook_delivery_dead",
            severity: "warning",
            source: "server",
            payload: {
              endpointId: row.endpointId,
              eventId: row.eventId,
              webhookTarget: summarizeWebhookTargetForOps(row.url),
              error: resolved.message,
              reason: "url_policy",
            },
          })
          .catch((e: unknown) => console.error("opsEvent fail", messageFromUnknown(e), e));
        continue;
      }

      const payloadStr = JSON.stringify(row.payload);
      const timestamp = Date.now().toString();

      const signature = createHmac("sha256", row.secret)
        .update(`${row.eventId}:${timestamp}:${payloadStr}`)
        .digest("hex");

      const delivery = await webhookHttpDelivery.send({
        connect: resolved.connect,
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": row.eventId,
          "X-Webhook-Timestamp": timestamp,
          "X-Webhook-Event": row.eventType,
          "X-Webhook-Signature": signature,
        },
        body: payloadStr,
        timeoutMs: 10_000,
      });

      const success = delivery.ok;
      const errorMsg = delivery.ok ? "" : delivery.error;

      if (success) {
        await db
          .update(webhookOutbox)
          .set({ status: "completed", lastError: null, processingClaimedAt: null })
          .where(eq(webhookOutbox.id, row.id));
      } else {
        const nextAttemptCount = row.attemptCount + 1;

        if (nextAttemptCount >= MAX_ATTEMPTS) {
          // Dead processing
          await db
            .update(webhookOutbox)
            .set({
              status: "dead",
              attemptCount: nextAttemptCount,
              lastError: errorMsg,
              processingClaimedAt: null,
            })
            .where(eq(webhookOutbox.id, row.id));

          // Log to ops health
          await db
            .insert(opsEvents)
            .values({
              eventType: "job.webhook_delivery_dead",
              severity: "warning",
              source: "server",
              payload: {
                endpointId: row.endpointId,
                eventId: row.eventId,
                webhookTarget: summarizeWebhookTargetForOps(row.url),
                error: errorMsg,
              },
            })
            .catch((e: unknown) => console.error("opsEvent fail", messageFromUnknown(e), e));
        } else {
          // Retry processing
          const delayMs = RETRY_DELAYS_MS[nextAttemptCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
          const nextAttemptAt = new Date(Date.now() + delayMs);

          await db
            .update(webhookOutbox)
            .set({
              status: "pending",
              attemptCount: nextAttemptCount,
              nextAttemptAt,
              lastError: errorMsg,
              processingClaimedAt: null,
            })
            .where(eq(webhookOutbox.id, row.id));
        }
      }
    }
  } catch (err: unknown) {
    console.error("Webhook poller error:", messageFromUnknown(err), err);
  } finally {
    isPolling = false;
  }
}

export function startWebhookPoller(intervalMs = 5000) {
  if (pollerTimeout) return;
  pollerTimeout = setInterval(() => {
    processWebhooks().catch((err: unknown) =>
      console.error("Webhook poller tick failed:", messageFromUnknown(err), err),
    );
  }, intervalMs);
}

export function stopWebhookPoller() {
  if (pollerTimeout) {
    clearInterval(pollerTimeout);
    pollerTimeout = null;
  }
}
