import type { WebhookOutbox } from "@shared/schema";

/** Delivery rows returned from `GET /api/webhooks/deliveries` (payload may be redacted). */
export type WebhookDeliveryListRow = Omit<WebhookOutbox, "payload"> & {
  payload: WebhookOutbox["payload"] | null;
  payloadRedacted: boolean;
};

/**
 * Editors can debug delivery status but should not see full webhook bodies by default
 * (payloads may contain inventory or PII). Admins keep full rows.
 */
export function mapWebhookDeliveriesForRole(rows: WebhookOutbox[], role: string): WebhookDeliveryListRow[] {
  const redact = role === "editor";
  return rows.map((row) => ({
    ...row,
    payload: redact ? null : row.payload,
    payloadRedacted: redact,
  }));
}
