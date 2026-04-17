import type { Request } from "express";
import { OPS_EVENT_SEVERITIES, type OpsEventSeverity } from "@shared/ops-health";
import { z } from "zod";

type Query = Request["query"];

/**
 * Shared query parsing for list-style endpoints (inventory list, history, ops feed, webhooks).
 * Preserves prior Express `parseInt` / `Number` coercion behavior so we do not change API semantics.
 */

function inventoryListLimit(raw: unknown): number {
  if (raw == null) return 50;
  const n = parseInt(String(raw), 10);
  const coerced = Number.isFinite(n) ? n : NaN;
  return Math.min(500, Math.max(1, coerced || 50));
}

function inventoryListOffset(raw: unknown): number {
  if (raw == null) return 0;
  const n = parseInt(String(raw), 10);
  return Math.max(0, (Number.isFinite(n) ? n : NaN) || 0);
}

const inventoryListPaginationSchema = z.object({
  limit: z.preprocess(inventoryListLimit, z.number().int()),
  offset: z.preprocess(inventoryListOffset, z.number().int()),
});

export function parseInventoryListPagination(query: Query): { limit: number; offset: number } {
  return inventoryListPaginationSchema.parse({
    limit: query.limit,
    offset: query.offset,
  });
}

function historyLimit(raw: unknown): number {
  if (raw == null || raw === "") return 100;
  if (Array.isArray(raw) && raw.length === 0) return 100;
  if (!raw) return 100;
  const n = parseInt(String(raw), 10);
  const coerced = Number.isFinite(n) ? n : NaN;
  return Math.min(500, Math.max(1, coerced || 100));
}

const historyPaginationSchema = z.object({
  limit: z.preprocess(historyLimit, z.number().int()),
  offset: z.preprocess(inventoryListOffset, z.number().int()),
});

export function parseHistoryPagination(query: Query): { limit: number; offset: number } {
  return historyPaginationSchema.parse({
    limit: query.limit,
    offset: query.offset,
  });
}

function webhookDeliveriesLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(1, Math.min(200, n)) : 50;
}

const webhookDeliveriesSchema = z.object({
  limit: z.preprocess(webhookDeliveriesLimit, z.number().int()),
});

export function parseWebhookDeliveriesLimit(query: Query): { limit: number } {
  return webhookDeliveriesSchema.parse({ limit: query.limit });
}

function opsEventsLimit(raw: unknown): number {
  const limitRaw = Number(raw ?? 100);
  return Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;
}

function opsEventsSeverity(raw: unknown): OpsEventSeverity | undefined {
  const severityRaw = String(raw ?? "").trim();
  return (OPS_EVENT_SEVERITIES as readonly string[]).includes(severityRaw)
    ? (severityRaw as OpsEventSeverity)
    : undefined;
}

const opsHealthEventsSchema = z.object({
  limit: z.preprocess(opsEventsLimit, z.number().int()),
  severity: z.preprocess(opsEventsSeverity, z.enum(OPS_EVENT_SEVERITIES).optional()),
});

/**
 * Used by `GET /api/ops-health/events`. Invalid or unknown `severity` values preprocess to
 * `undefined` (no severity filter) so the handler never rejects the request for bad enums.
 */
export function parseOpsHealthEventsQuery(query: Query): { limit: number; severity?: OpsEventSeverity } {
  return opsHealthEventsSchema.parse({
    limit: query.limit,
    severity: query.severity,
  });
}

const positiveIntPathParamSchema = z.coerce.number().int().positive();

/**
 * Strict `:id` path param (e.g. **`PATCH` / `DELETE /api/webhooks/:id`**).
 * Rejects non-integers (**`1.5`**), zero, negatives, and non-numeric strings.
 */
export function parsePositiveIntPathParam(raw: unknown): { ok: true; id: number } | { ok: false } {
  const r = positiveIntPathParamSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  return { ok: true, id: r.data };
}
